import { registerWebModule, NativeModule } from 'expo';

import { ExpoMapboxNavigationModuleEvents } from './ExpoMapboxNavigation.types';

class ExpoMapboxNavigationModule extends NativeModule<ExpoMapboxNavigationModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(ExpoMapboxNavigationModule, 'ExpoMapboxNavigationModule');
