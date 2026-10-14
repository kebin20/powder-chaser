/** Explicit providers, so Best Match cannot silently make comparison columns identical. */
export const WEATHER_MODELS = [
  { id: 'jma_msm', label: 'JMA MSM', sourceUrl: 'https://open-meteo.com/en/docs/jma-api' },
  { id: 'ecmwf_ifs025', label: 'ECMWF IFS', sourceUrl: 'https://open-meteo.com/en/docs/ecmwf-api' },
  { id: 'gfs_global', label: 'GFS', sourceUrl: 'https://open-meteo.com/en/docs/gfs-api' },
] as const;
