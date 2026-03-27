import 'package:flutter/material.dart';

import '../data/models/lead.dart';
import 'theme/app_colors.dart';

/// Hot = red, warm = orange, cold = blue (pipeline / CRM badges).
Color colorForLeadTemperature(LeadTemperature t) {
  return switch (t) {
    LeadTemperature.hot => AppColors.hot,
    LeadTemperature.warm => AppColors.warm,
    LeadTemperature.cold => AppColors.cold,
  };
}
