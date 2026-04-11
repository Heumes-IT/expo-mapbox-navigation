import type { MapboxNavigationPluginProps } from '../types';

export interface StringsResources {
  resources: {
    string?: Array<{ $?: { name?: string; translatable?: string }; _?: string }>;
  };
}

export function applyMapboxStringsXml(
  xml: StringsResources,
  props: MapboxNavigationPluginProps
): StringsResources {
  if (!props.accessToken) return xml;

  const resources = xml.resources ?? { string: [] };
  const strings = resources.string ? [...resources.string] : [];

  const existingIndex = strings.findIndex((s) => s.$?.name === 'mapbox_access_token');
  const entry = {
    $: { name: 'mapbox_access_token', translatable: 'false' },
    _: props.accessToken,
  };

  if (existingIndex >= 0) {
    strings[existingIndex] = entry;
  } else {
    strings.push(entry);
  }

  return { ...xml, resources: { ...resources, string: strings } };
}
