import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps, NavigatorScreenParams } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

export type MainTabParamList = {
  Dashboard: undefined;
  Inbox: undefined;
  /** `scrollToLeadId`: after adding a lead, scroll that card into view in the New column. */
  Pipeline: { scrollToLeadId?: string } | undefined;
  Assignment: undefined;
  FollowUps: undefined;
  Analytics: undefined;
  Settings: undefined;
};

/** Optional fields when opening Add Lead from voice-to-lead “edit before saving”. */
export type AddLeadPrefill = {
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  notes?: string;
  dealValueText?: string;
  priority?: "low" | "medium" | "high";
};

export type RootStackParamList = {
  Login: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
  AddLead: { prefill?: AddLeadPrefill } | undefined;
  /** Lead profile (read-only fields + AI). App title: “Lead”. */
  LeadDetail: { leadId: string; focusAi?: boolean };
  /** Same screen as `LeadDetail` — alias for docs / deep links; use `LeadDetail` in code. */
  LeadDetails: { leadId: string; focusAi?: boolean };
  EditLead: { leadId: string };
  LeadAssistant: { leadId: string };
  /** Review/delete duplicate name+phone groups (stack). */
  DuplicateLeadsReview: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

export type MainTabScreenProps<T extends keyof MainTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
