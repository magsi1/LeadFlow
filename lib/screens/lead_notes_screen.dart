import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/widgets/lead_note_bubble.dart';
import '../data/models/api_lead.dart';
import '../data/models/lead_note.dart';
import '../data/services/lead_notes_service.dart';

class LeadNotesScreen extends StatefulWidget {
  const LeadNotesScreen({super.key, required this.lead});

  final ApiLead lead;

  @override
  State<LeadNotesScreen> createState() => _LeadNotesScreenState();
}

class _LeadNotesScreenState extends State<LeadNotesScreen> {
  final _service = LeadNotesService();
  final _scrollController = ScrollController();
  final _textController = TextEditingController();
  int _lastNoteCount = 0;
  bool _isSending = false;

  @override
  void initState() {
    super.initState();
    _textController.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _textController.dispose();
    super.dispose();
  }

  void _scheduleScrollToBottomIfNeeded(int count) {
    if (count < _lastNoteCount) {
      _lastNoteCount = count;
      return;
    }
    if (count == _lastNoteCount) return;
    _lastNoteCount = count;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
      );
    });
  }

  Future<void> _sendNote() async {
    final trimmed = _textController.text.trim();
    if (trimmed.isEmpty || _isSending) return;

    final client = Supabase.instance.client;
    final user = client.auth.currentUser;
    if (user == null) {
      debugPrint('sendNote: user not authenticated');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('User not authenticated')),
      );
      return;
    }

    final currentLeadId = widget.lead.id;
    if (currentLeadId.isEmpty) {
      debugPrint('sendNote: missing lead id');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Invalid lead')),
      );
      return;
    }

    setState(() => _isSending = true);
    try {
      debugPrint('Sending note...');
      debugPrint('User ID: ${user.id}');
      debugPrint('Lead ID: $currentLeadId');

      await _service.addNote(leadId: currentLeadId, content: trimmed);

      if (!mounted) return;
      _textController.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Note sent'),
          duration: Duration(seconds: 2),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } catch (e, st) {
      debugPrint('sendNote error: $e\n$st');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to send note'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = Supabase.instance.client.auth.currentUser;
    final title = widget.lead.name.trim().isEmpty ? 'Lead' : widget.lead.name;

    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: Text(title)),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text('Sign in to view lead notes.'),
          ),
        ),
      );
    }

    if (widget.lead.id.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: Text(title)),
        body: const Center(
          child: Text('Invalid lead — missing id.'),
        ),
      );
    }

    final canSend = _textController.text.trim().isNotEmpty && !_isSending;

    return Scaffold(
      backgroundColor: const Color(0xFFECE5DD),
      appBar: AppBar(
        title: Text(title),
        surfaceTintColor: Colors.transparent,
      ),
      body: Column(
        children: [
          Expanded(
            child: StreamBuilder<List<LeadNote>>(
              stream: _service.streamNotes(widget.lead.id),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'Could not load notes:\n${snapshot.error}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.red),
                      ),
                    ),
                  );
                }

                if (!snapshot.hasData) {
                  return const Center(
                    child: CircularProgressIndicator.adaptive(),
                  );
                }

                final notes = snapshot.data!;
                _scheduleScrollToBottomIfNeeded(notes.length);

                return AnimatedSwitcher(
                  duration: const Duration(milliseconds: 280),
                  switchInCurve: Curves.easeOutCubic,
                  switchOutCurve: Curves.easeInCubic,
                  child: notes.isEmpty
                      ? const _NotesEmptyState(key: ValueKey<String>('empty'))
                      : ListView.builder(
                          key: ValueKey<int>(notes.length),
                          controller: _scrollController,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 16,
                          ),
                          itemCount: notes.length,
                          itemBuilder: (context, index) {
                            final note = notes[index];
                            return Padding(
                              padding: EdgeInsets.only(
                                bottom: index < notes.length - 1 ? 8 : 0,
                              ),
                              child: NoteBubble(
                                note: note,
                                isMine: note.userId == user.id,
                              ),
                            );
                          },
                        ),
                );
              },
            ),
          ),
          Material(
            color: const Color(0xFFF0F0F0),
            elevation: 4,
            shadowColor: Colors.black26,
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(30),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.08),
                        blurRadius: 4,
                        offset: const Offset(0, 1),
                      ),
                    ],
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _textController,
                          enabled: !_isSending,
                          minLines: 1,
                          maxLines: 5,
                          textCapitalization: TextCapitalization.sentences,
                          textInputAction: TextInputAction.newline,
                          decoration: const InputDecoration(
                            hintText: 'Message',
                            border: InputBorder.none,
                            enabledBorder: InputBorder.none,
                            focusedBorder: InputBorder.none,
                            errorBorder: InputBorder.none,
                            focusedErrorBorder: InputBorder.none,
                            contentPadding: EdgeInsets.fromLTRB(
                              20,
                              12,
                              4,
                              12,
                            ),
                          ),
                          onSubmitted: (_) {
                            if (canSend) _sendNote();
                          },
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.only(right: 4, bottom: 2),
                        child: IconButton(
                          tooltip: 'Send',
                          onPressed: canSend ? _sendNote : null,
                          icon: _isSending
                              ? SizedBox(
                                  width: 22,
                                  height: 22,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Theme.of(context).colorScheme.primary,
                                  ),
                                )
                              : Icon(
                                  Icons.send_rounded,
                                  color: canSend
                                      ? Theme.of(context).colorScheme.primary
                                      : Theme.of(context).disabledColor,
                                ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NotesEmptyState extends StatelessWidget {
  const _NotesEmptyState({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.chat_bubble_outline, size: 48, color: Color(0xFF8696A0)),
          SizedBox(height: 8),
          Text(
            'Start conversation with this lead',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 15,
              color: Color(0xFF667781),
            ),
          ),
        ],
      ),
    );
  }
}
