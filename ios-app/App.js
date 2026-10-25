import { Image, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StoreProvider, useStore } from "./src/store";
import { useTheme } from "./src/theme";
import { articleKey } from "./src/data";
import Detail from "./src/Detail";
import { BrowseScreen, ListScreen, SavedScreen, SearchScreen, TodayScreen } from "./src/screens";
import { useColorScheme } from "react-native";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const icon = (name) => ({ color, focused, size }) => (
  <Ionicons name={focused ? name : `${name}-outline`} size={size} color={color} />
);

function Brand() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Image source={require("./assets/icon.png")} style={{ width: 30, height: 30, borderRadius: 8 }} />
      <Text style={{ fontSize: 20, fontWeight: "800", color: t.text, letterSpacing: -0.3 }}>
        ICU <Text style={{ color: t.teal }}>Scope</Text>
      </Text>
    </View>
  );
}

function Tabs() {
  const t = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.textMuted,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border },
        headerStyle: { backgroundColor: t.bg },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        headerTitleStyle: { color: t.text, fontWeight: "800" },
        headerShadowVisible: false,
      }}
    >
      <Tab.Screen name="Today" component={TodayScreen} options={{ headerTitle: () => <Brand />, headerTitleAlign: "left", tabBarLabel: "Today", tabBarIcon: icon("home") }} />
      <Tab.Screen name="Browse" component={BrowseScreen} options={{ tabBarIcon: icon("grid") }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ tabBarIcon: icon("search") }} />
      <Tab.Screen name="Saved" component={SavedScreen} options={{ tabBarIcon: icon("bookmark") }} />
    </Tab.Navigator>
  );
}

function DetailScreen({ route }) {
  const { savedKeys, toggleSave } = useStore();
  const a = route.params.article;
  return <Detail article={a} saved={savedKeys.has(articleKey(a))} onToggleSave={toggleSave} />;
}

function Root() {
  const t = useTheme();
  const dark = useColorScheme() === "dark";
  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: t.bg, card: t.bg, text: t.text, border: t.border, primary: t.accent },
  };
  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style="auto" />
      <Stack.Navigator screenOptions={{ headerTintColor: t.accent, headerBackTitle: "Back" }}>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="List" component={ListScreen} options={({ route }) => ({ title: route.params.title })} />
        <Stack.Screen name="Detail" component={DetailScreen} options={{ title: "", headerTransparent: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Root />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
