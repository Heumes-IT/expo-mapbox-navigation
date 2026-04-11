import { requireNativeView } from 'expo';
import * as React from 'react';

import { ExpoMapboxNavigationViewProps } from './ExpoMapboxNavigation.types';

const NativeView: React.ComponentType<ExpoMapboxNavigationViewProps> =
  requireNativeView('ExpoMapboxNavigation');

export default function ExpoMapboxNavigationView(props: ExpoMapboxNavigationViewProps) {
  return <NativeView {...props} />;
}
