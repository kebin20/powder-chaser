import type { Resort } from '../types';

/** Reference sampling coordinates/elevations, not an exact lift or observation station. */
const resort = (
  id: string, name: string, region: Resort['region'],
  latitude: number, longitude: number, baseElevationM: number, upperElevationM: number,
  officialUrl: string, officialReportUrl = officialUrl,
): Resort => ({
  id, name, region, latitude, longitude, baseElevationM, upperElevationM,
  baseElevation: baseElevationM, upperElevation: upperElevationM,
  officialUrl, officialReportUrl,
});

export const RESORTS: Resort[] = [
  resort('myoko', 'Akakura Kanko', 'Niigata', 36.887, 138.174, 740, 1500,
    'https://www.akr-ski.com/'),
  resort('kagura', 'Kagura', 'Niigata', 36.893, 138.776, 620, 1845,
    'https://www.princehotels.co.jp/ski/kagura/'),
  resort('hakuba', 'Hakuba Happo-one', 'Nagano', 36.701, 137.824, 770, 1680,
    'https://www.happo-one.jp/en/winter/'),
  resort('nozawa', 'Nozawa Onsen', 'Nagano', 36.922, 138.457, 616, 1407,
    'https://en.nozawaski.com/',
    'https://en.nozawaski.com/the-mountain/moutain-info/slopes-lifts/'),
  resort('madarao', 'Madarao Mountain', 'Nagano', 36.853, 138.289, 910, 1350,
    'https://www.madarao.jp/ski'),
  resort('niseko', 'Niseko Grand Hirafu', 'Hokkaido', 42.864, 140.697, 260, 1200,
    'https://www.grand-hirafu.jp/', 'https://www.grand-hirafu.jp/snow/'),
  resort('rusutsu', 'Rusutsu', 'Hokkaido', 42.737, 140.909, 400, 994,
    'https://rusutsu.com/en/', 'https://rusutsu.com/en/snow-and-weather-report/'),
  resort('furano', 'Furano', 'Hokkaido', 43.343, 142.352, 235, 1074,
    'https://www.princehotels.com/en/ski/furano/index.html'),
];

export const resorts = RESORTS;
