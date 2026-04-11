export type GradleProperty =
  | { type: 'property'; key: string; value: string }
  | { type: 'comment'; value: string };

export interface MapboxGradleOptions {
  downloadsToken: string | undefined;
}

const KEY = 'MAPBOX_DOWNLOADS_TOKEN';

export function applyMapboxGradleProperties(
  props: GradleProperty[],
  opts: MapboxGradleOptions
): GradleProperty[] {
  if (!opts.downloadsToken) {
    return props;
  }

  const filtered = props.filter(
    (p) => !(p.type === 'property' && p.key === KEY)
  );
  filtered.push({ type: 'property', key: KEY, value: opts.downloadsToken });
  return filtered;
}
