import { Ionicons } from "@expo/vector-icons";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect } from "react";
import { Platform } from "react-native";
import { useAppPreferencesStore } from "./state/useAppPreferencesStore";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LoadingScreen } from "./components/LoadingScreen";
import type { MainTabParamList, RootStackParamList } from "./navigation/types";
import { AddLeadScreen } from "./screens/AddLeadScreen";
import { EditLeadScreen } from "./screens/EditLeadScreen";
import { AnalyticsScreen } from "./screens/AnalyticsScreen";
import { AssignmentScreen } from "./screens/AssignmentScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { FollowUpsScreen } from "./screens/FollowUpsScreen";
import { InboxScreen } from "./screens/InboxScreen";
import { PipelineScreen } from "./screens/PipelineScreen";
import { LeadAssistantScreen } from "./screens/LeadAssistantScreen";
import { LeadDetailScreen } from "./screens/LeadDetailScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { DuplicateLeadsReviewScreen } from "./screens/DuplicateLeadsReviewScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { cancelAllNotifications, initializeDailyDigestScheduling } from "./services/notificationService";
import { configureNotificationHandler } from "./services/push";
import { connectSocket, disconnectSocket } from "./services/socket";
import { ToastProvider } from "./context/ToastContext";
import { startSupabaseAuth } from "./lib/supabaseAuthBootstrap";
import { isSupabaseConfigured } from "./lib/supabaseClient";
import { useAppStore } from "./state/useAppStore";
import { useAuthStore } from "./state/useAuthStore";
import { colors } from "./theme/colors";

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.card,
    border: colors.border,
    text: colors.text,
    primary: colors.primary,
  },
};

function MainTabs() {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user?.id) {
      disconnectSocket();
      return;
    }
    connectSocket(user.id);
    return () => {
      disconnectSocket();
    };
  }, [user?.id]);

  const isManager = user?.role === "admin" || user?.role === "manager";

  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={{
        /** Keep tab screens mounted so `leadsDataRevision` listeners refetch after Settings deletes. */
        lazy: false,
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingTop: 4,
        },
        tabBarActiveTintColor: colors.brandGreen,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Inbox"
        component={InboxScreen}
        options={{
          title: "Inbox",
          tabBarIcon: ({ color, size }) => <Ionicons name="mail-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Pipeline"
        component={PipelineScreen}
        options={{
          title: "Pipeline",
          tabBarIcon: ({ color, size }) => <Ionicons name="layers-outline" size={size} color={color} />,
        }}
      />
      {isManager ? (
        <Tab.Screen
          name="Assignment"
          component={AssignmentScreen}
          options={{
            title: "Assignment",
            tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
          }}
        />
      ) : null}
      <Tab.Screen
        name="FollowUps"
        component={FollowUpsScreen}
        options={{
          title: "Follow-ups",
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          title: "Analytics",
          tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const user = useAuthStore((s) => s.user);
  const restoringSession = useAuthStore((s) => s.restoringSession);
  const prefsHydrated = useAppPreferencesStore((s) => s.hydrated);
  const dailyDigestOn = useAppPreferencesStore((s) => s.dailyDigestNotifications);
  const leadsDataRevision = useAppStore((s) => s.leadsDataRevision);

  useEffect(() => {
    configureNotificationHandler();
  }, []);

  useEffect(() => {
    return startSupabaseAuth();
  }, []);

  useEffect(() => {
    void useAppPreferencesStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!user?.id) {
      void cancelAllNotifications();
      return;
    }
    if (!prefsHydrated) return;
    if (!isSupabaseConfigured()) return;
    if (!dailyDigestOn) {
      void cancelAllNotifications();
      return;
    }
    void initializeDailyDigestScheduling();
  }, [user?.id, prefsHydrated, dailyDigestOn, leadsDataRevision]);

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <StatusBar style="light" />
        {restoringSession ? (
          <LoadingScreen message="Restoring session…" />
        ) : (
          <NavigationContainer theme={navTheme} fallback={<LoadingScreen message="Loading…" />}>
            <Stack.Navigator
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: "slide_from_right",
              }}
            >
              {!user ? (
                <Stack.Screen name="Login" component={LoginScreen} />
              ) : (
                <>
                  <Stack.Screen name="Main" component={MainTabs} />
                  <Stack.Screen
                    name="LeadDetail"
                    component={LeadDetailScreen}
                    options={{
                      headerShown: true,
                      title: "Lead",
                      headerStyle: { backgroundColor: colors.bg },
                      headerTintColor: colors.text,
                      headerShadowVisible: false,
                    }}
                  />
                  <Stack.Screen
                    name="LeadDetails"
                    component={LeadDetailScreen}
                    options={{
                      headerShown: true,
                      title: "Lead details",
                      headerStyle: { backgroundColor: colors.bg },
                      headerTintColor: colors.text,
                      headerShadowVisible: false,
                    }}
                  />
                  <Stack.Screen
                    name="LeadAssistant"
                    component={LeadAssistantScreen}
                    options={{
                      headerShown: true,
                      title: "AI assistant",
                      headerStyle: { backgroundColor: colors.bg },
                      headerTintColor: colors.text,
                      headerShadowVisible: false,
                    }}
                  />
                  <Stack.Screen
                    name="AddLead"
                    component={AddLeadScreen}
                    options={{
                      headerShown: true,
                      title: "Add lead",
                      headerStyle: { backgroundColor: colors.bg },
                      headerTintColor: colors.text,
                      headerShadowVisible: false,
                    }}
                  />
                  <Stack.Screen
                    name="EditLead"
                    component={EditLeadScreen}
                    options={{
                      headerShown: true,
                      title: "Edit lead",
                      headerStyle: { backgroundColor: colors.bg },
                      headerTintColor: colors.text,
                      headerShadowVisible: false,
                    }}
                  />
                  <Stack.Screen
                    name="DuplicateLeadsReview"
                    component={DuplicateLeadsReviewScreen}
                    options={{
                      headerShown: true,
                      title: "Duplicate leads",
                      headerStyle: { backgroundColor: colors.bg },
                      headerTintColor: colors.text,
                      headerShadowVisible: false,
                    }}
                  />
                </>
              )}
            </Stack.Navigator>
          </NavigationContainer>
        )}
      </ToastProvider>
    </SafeAreaProvider>
  );
}
