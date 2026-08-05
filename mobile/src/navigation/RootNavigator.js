import { useEffect, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { getSession } from '../lib/auth'
import HomeScreen from '../screens/HomeScreen'
import RouteInputScreen from '../screens/RouteInputScreen'
import RouteCompareScreen from '../screens/RouteCompareScreen'
import RouteDetailScreen from '../screens/RouteDetailScreen'
import RouteCourseScreen from '../screens/RouteCourseScreen'
import NavigatingScreen from '../screens/NavigatingScreen'
import CompanionScreen from '../screens/CompanionScreen'
import CoursesScreen from '../screens/CoursesScreen'
import CourseDetailScreen from '../screens/CourseDetailScreen'
import TunnelsScreen from '../screens/TunnelsScreen'
import TunnelDetailScreen from '../screens/TunnelDetailScreen'
import LoginScreen from '../screens/LoginScreen'
import SignUpScreen from '../screens/SignUpScreen'
import MyPageScreen from '../screens/MyPageScreen'
import PlaceholderScreen from '../screens/PlaceholderScreen'
import { COLORS } from '../theme'

const Stack = createNativeStackNavigator()

export default function RootNavigator() {
  const [initialRoute, setInitialRoute] = useState(null)

  useEffect(() => {
    (async () => setInitialRoute((await getSession()) ? 'Home' : 'Login'))()
  }, [])

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    )
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerStyle: { backgroundColor: '#fff' },
          headerTintColor: COLORS.textHead,
          headerTitleStyle: { fontWeight: '800' },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="RouteInput" component={RouteInputScreen} options={{ title: '길찾기' }} />
        <Stack.Screen name="RouteCompare" component={RouteCompareScreen} options={{ title: '경로 비교' }} />
        <Stack.Screen name="RouteDetail" component={RouteDetailScreen} options={{ title: '경로 상세' }} />
        <Stack.Screen name="RouteCourse" component={RouteCourseScreen} options={{ title: '코스 안내' }} />
        <Stack.Screen name="Navigating" component={NavigatingScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Companion" component={CompanionScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Courses" component={CoursesScreen} options={{ title: '안심 코스' }} />
        <Stack.Screen name="CourseDetail" component={CourseDetailScreen} options={{ title: '코스 상세' }} />
        <Stack.Screen name="Tunnels" component={TunnelsScreen} options={{ title: '터널 백과' }} />
        <Stack.Screen name="TunnelDetail" component={TunnelDetailScreen} options={{ title: '터널 상세' }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SignUp" component={SignUpScreen} options={{ title: '회원가입' }} />
        <Stack.Screen name="MyPage" component={MyPageScreen} options={{ title: '마이페이지' }} />
        <Stack.Screen name="Placeholder" component={PlaceholderScreen} options={{ title: '' }} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
