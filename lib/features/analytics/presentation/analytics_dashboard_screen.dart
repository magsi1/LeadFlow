import 'dart:async';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/auth/supabase_auth_helpers.dart';
import '../../../data/repositories/supabase/supabase_leads_select.dart';
import '../../../services/lead_service.dart';

enum FilterType { today, week, month }

class AnalyticsDashboardScreen extends StatelessWidget {
  const AnalyticsDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) => const AnalyticsScreen();
}

class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  final supabase = Supabase.instance.client;

  FilterType selectedFilter = FilterType.week;
  bool isLoading = true;
  bool _isFetching = false;
  bool _needsRefetch = false;

  int totalLeads = 0;
  int hotLeads = 0;
  int wonLeads = 0;
  int followUps = 0;
  double totalRevenue = 0;
  double conversionRate = 0;

  Map<String, int> statusCount = {};
  List<int> dailyLeads = [];

  RealtimeChannel? _leadsChannel;
  Timer? _debounceTimer;

  @override
  void initState() {
    super.initState();
    fetchAnalytics();
    _leadsChannel = supabase
        .channel('leads-changes')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'leads',
          callback: (payload) {
            _scheduleFetch();
          },
        )
        .subscribe();
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    if (_leadsChannel != null) {
      supabase.removeChannel(_leadsChannel!);
    }
    super.dispose();
  }

  void _scheduleFetch() {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 350), () {
      fetchAnalytics();
    });
  }

  Future<void> fetchAnalytics() async {
    if (_isFetching) {
      _needsRefetch = true;
      return;
    }

    _isFetching = true;
    if (mounted) {
      setState(() => isLoading = true);
    }

    try {
      final now = DateTime.now();
      DateTime startDate;

      switch (selectedFilter) {
        case FilterType.today:
          startDate = DateTime(now.year, now.month, now.day);
          break;
        case FilterType.week:
          startDate = DateTime(now.year, now.month, now.day).subtract(const Duration(days: 6));
          break;
        case FilterType.month:
          startDate = DateTime(now.year, now.month, now.day).subtract(const Duration(days: 29));
          break;
      }

      final userId = supabase.auth.currentUser?.id;
      logLeadsDbOp('select (analytics)', extra: {
        'filter': selectedFilter.name,
      });
      if (userId == null) {
        logLeadsDbOp('select (analytics skipped: no auth user)');
        totalLeads = 0;
        hotLeads = 0;
        wonLeads = 0;
        followUps = 0;
        totalRevenue = 0;
        conversionRate = 0;
        statusCount = {'new': 0, 'contacted': 0, 'closed': 0};
        dailyLeads = [0, 0, 0, 0, 0];
        return;
      }

      await LeadService.claimUnassignedLeadsForCurrentUser();
      final raw = await supabase
          .from('leads')
          .select(SupabaseLeadsSelect.columns)
          .eq('assigned_to', userId)
          .gte('created_at', startDate.toUtc().toIso8601String());
      final leads = List<Map<String, dynamic>>.from(raw);

      totalLeads = leads.length;
      hotLeads = leads.where((lead) => _status(lead) == 'contacted').length;
      wonLeads = leads.where((lead) => _status(lead) == 'closed').length;
      followUps = leads.where((lead) => _status(lead) == 'new').length;
      totalRevenue = leads
          .where((lead) => (lead['deal_status'] ?? '').toString().toLowerCase() == 'won')
          .fold<double>(0, (sum, lead) => sum + ((lead['deal_value'] as num?)?.toDouble() ?? 0));
      conversionRate = totalLeads == 0 ? 0 : wonLeads / totalLeads;

      final newCount = leads.where((lead) => _status(lead) == 'new').length;
      final contactedCount = leads.where((lead) => _status(lead) == 'contacted').length;
      final closedCount = leads.where((lead) => _status(lead) == 'closed').length;

      statusCount = {
        'new': newCount,
        'contacted': contactedCount,
        'closed': closedCount,
      };

      final baseDays = <DateTime>[
        for (var i = 4; i >= 0; i--) DateTime(now.year, now.month, now.day).subtract(Duration(days: i)),
      ];
      final grouped = <DateTime, int>{for (final day in baseDays) day: 0};

      for (final lead in leads) {
        final created = DateTime.tryParse((lead['created_at'] ?? '').toString())?.toLocal();
        if (created == null) continue;
        final day = DateTime(created.year, created.month, created.day);
        if (grouped.containsKey(day)) {
          grouped[day] = (grouped[day] ?? 0) + 1;
        }
      }

      dailyLeads = baseDays.map((d) => grouped[d] ?? 0).toList();
    } catch (error) {
      debugPrint('fetchAnalytics error: $error');
    } finally {
      _isFetching = false;
      if (mounted) {
        setState(() => isLoading = false);
      }
      if (_needsRefetch) {
        _needsRefetch = false;
        _scheduleFetch();
      }
    }
  }

  String _status(Map<String, dynamic> lead) {
    return (lead['status'] ?? '').toString().trim().toLowerCase();
  }

  Widget buildSummaryCards() {
    final cards = <AnalyticsCardData>[
      AnalyticsCardData('Total Leads', '$totalLeads', Icons.people_alt_rounded, const Color(0x332563EB), const Color(0xFF60A5FA)),
      AnalyticsCardData('Hot Leads', '$hotLeads', Icons.local_fire_department_rounded, const Color(0x33DC2626), const Color(0xFFF87171)),
      AnalyticsCardData('Won Leads', '$wonLeads', Icons.emoji_events_rounded, const Color(0x3316A34A), const Color(0xFF4ADE80)),
      AnalyticsCardData('Follow-ups Due', '$followUps', Icons.schedule_rounded, const Color(0x33F59E0B), const Color(0xFFFBBF24)),
      AnalyticsCardData('Total Revenue', totalRevenue.toStringAsFixed(2), Icons.payments_rounded, const Color(0x3314B8A6), const Color(0xFF2DD4BF)),
      AnalyticsCardData('Conversion Rate', '${(conversionRate * 100).toStringAsFixed(0)}%', Icons.trending_up_rounded, const Color(0x339333EA), const Color(0xFFC084FC)),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        final crossAxisCount = constraints.maxWidth >= 1200
            ? 6
            : constraints.maxWidth >= 900
                ? 3
                : constraints.maxWidth >= 620
                    ? 2
                    : 1;

        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: cards.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: crossAxisCount,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 2.1,
          ),
          itemBuilder: (context, index) => AnalyticsCard(data: cards[index]),
        );
      },
    );
  }

  Widget buildFilterChips() {
    final items = <({FilterType type, String label})>[
      (type: FilterType.today, label: 'Today'),
      (type: FilterType.week, label: 'Week'),
      (type: FilterType.month, label: 'Month'),
    ];

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: items.map((item) {
        final selected = selectedFilter == item.type;
        return ChoiceChip(
          label: Text(item.label),
          selected: selected,
          onSelected: (_) {
            if (selectedFilter == item.type) return;
            setState(() {
              selectedFilter = item.type;
            });
            _scheduleFetch();
          },
          selectedColor: const Color(0xFF2563EB),
          backgroundColor: const Color(0xFF1F2937),
          labelStyle: TextStyle(
            color: selected ? Colors.white : const Color(0xFFCBD5E1),
            fontWeight: FontWeight.w600,
          ),
          side: BorderSide(
            color: selected ? const Color(0xFF3B82F6) : const Color(0xFF334155),
          ),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        );
      }).toList(),
    );
  }

  Widget buildBarChart() {
    final bars = dailyLeads.isEmpty ? [0, 0, 0, 0, 0] : dailyLeads;
    final maxY = bars.fold<int>(1, (max, value) => value > max ? value : max).toDouble() + 2;

    return SizedBox(
      height: 240,
      child: BarChart(
        BarChartData(
          maxY: maxY,
          gridData: FlGridData(
            show: true,
            drawVerticalLine: false,
            getDrawingHorizontalLine: (_) => FlLine(
              color: Colors.white.withValues(alpha: 0.08),
              strokeWidth: 1,
            ),
          ),
          borderData: FlBorderData(show: false),
          titlesData: FlTitlesData(
            topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            leftTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 28,
                getTitlesWidget: (value, meta) => Text(
                  value.toInt().toString(),
                  style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                ),
              ),
            ),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                getTitlesWidget: (value, meta) => Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    'D${value.toInt() + 1}',
                    style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 11),
                  ),
                ),
              ),
            ),
          ),
          barGroups: [
            for (int i = 0; i < bars.length; i++)
              BarChartGroupData(
                x: i,
                barRods: [
                  BarChartRodData(
                    toY: bars[i].toDouble(),
                    width: 18,
                    color: const Color(0xFF60A5FA),
                    borderRadius: BorderRadius.circular(8),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget buildPieChart() {
    final newValue = (statusCount['new'] ?? 0).toDouble();
    final contactedValue = (statusCount['contacted'] ?? 0).toDouble();
    final closedValue = (statusCount['closed'] ?? 0).toDouble();

    return SizedBox(
      height: 250,
      child: PieChart(
        PieChartData(
          sectionsSpace: 3,
          centerSpaceRadius: 42,
          sections: [
            PieChartSectionData(
              value: newValue,
              color: const Color(0xFFEF4444),
              title: 'New\n${statusCount['new'] ?? 0}',
              radius: 74,
              titleStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white),
            ),
            PieChartSectionData(
              value: contactedValue,
              color: const Color(0xFFF59E0B),
              title: 'Contacted\n${statusCount['contacted'] ?? 0}',
              radius: 74,
              titleStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white),
            ),
            PieChartSectionData(
              value: closedValue,
              color: const Color(0xFF3B82F6),
              title: 'Closed\n${statusCount['closed'] ?? 0}',
              radius: 74,
              titleStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white),
            ),
          ],
        ),
      ),
    );
  }

  Widget sectionCard({
    required String title,
    required Widget child,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF111827),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF1F2937)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B1220),
      body: SafeArea(
        child: isLoading
            ? const Center(child: CircularProgressIndicator())
            : SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Analytics Dashboard',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'SaaS-style performance overview',
                      style: TextStyle(color: Color(0xFF94A3B8)),
                    ),
                    const SizedBox(height: 16),
                    buildSummaryCards(),
                    const SizedBox(height: 16),
                    buildFilterChips(),
                    const SizedBox(height: 16),
                    sectionCard(
                      title: 'Leads Trend',
                      child: buildBarChart(),
                    ),
                    const SizedBox(height: 16),
                    sectionCard(
                      title: 'Lead Distribution',
                      child: buildPieChart(),
                    ),
                    const SizedBox(height: 12),
                  ],
                ),
              ),
      ),
    );
  }
}

class AnalyticsCardData {
  const AnalyticsCardData(this.title, this.value, this.icon, this.backgroundColor, this.iconColor);

  final String title;
  final String value;
  final IconData icon;
  final Color backgroundColor;
  final Color iconColor;
}

class AnalyticsCard extends StatelessWidget {
  const AnalyticsCard({super.key, required this.data});

  final AnalyticsCardData data;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: data.backgroundColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: data.iconColor.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: data.iconColor.withValues(alpha: 0.2),
            child: Icon(data.icon, color: data.iconColor),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  data.title,
                  style: const TextStyle(
                    color: Color(0xFFE2E8F0),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  data.value,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
