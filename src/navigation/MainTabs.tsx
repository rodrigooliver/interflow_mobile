import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {ChatsScreen} from '../screens/chat/ChatsScreen';
import {InternalChatsScreen} from '../screens/chat/InternalChatsScreen';
import {SettingsScreen} from '../screens/SettingsScreen';
import {BottomTabBar} from '../components/BottomTabBar';
import type {ChatUIMode} from '../config/env';

export type MainTabParamList = {
  ChatsTab: undefined;
  InternalTab: undefined;
  SettingsTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

interface MainTabsProps {
  onOpenChat: (chatId: string, title?: string) => void;
  onOpenWeb: (path: string) => void;
  onSignOut: () => void;
  onModeChanged?: (mode: ChatUIMode) => void;
}

export function MainTabs({
  onOpenChat,
  onOpenWeb,
  onSignOut,
  onModeChanged,
}: MainTabsProps) {
  return (
    <Tab.Navigator
      tabBar={props => <BottomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
      }}>
      <Tab.Screen name="ChatsTab">
        {() => (
          <ChatsScreen onOpenChat={onOpenChat} onOpenWeb={onOpenWeb} />
        )}
      </Tab.Screen>
      <Tab.Screen name="InternalTab">
        {() => (
          <InternalChatsScreen onOpenChat={onOpenChat} onOpenWeb={onOpenWeb} />
        )}
      </Tab.Screen>
      <Tab.Screen name="SettingsTab">
        {() => (
          <SettingsScreen
            onModeChanged={onModeChanged}
            onSignOut={onSignOut}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
