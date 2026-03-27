import 'package:flutter/material.dart';

import '../data/models/lead.dart';

/// Hot = red, warm = orange, cold = blue (pipeline / CRM badges).
Color colorForLeadTemperature(LeadTemperature t) {
  return switch (t) {
    LeadTemperature.hot => Colors.red,
    LeadTemperature.warm => Colors.orange,
    LeadTemperature.cold => Colors.blue,
  };
}
