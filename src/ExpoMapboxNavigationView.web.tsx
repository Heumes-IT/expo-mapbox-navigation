import * as React from 'react';

import { ExpoMapboxNavigationViewProps } from './ExpoMapboxNavigation.types';

export default function ExpoMapboxNavigationView(props: ExpoMapboxNavigationViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
