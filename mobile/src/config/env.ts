import { Platform } from 'react-native';
import { z } from 'zod';

const developmentApiUrl =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:3000/v1'
    : 'http://localhost:3000/v1';

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? developmentApiUrl : '');
const parsedApiUrl = z.url('EXPO_PUBLIC_API_URL must be a valid URL').safeParse(apiUrl);

if (!parsedApiUrl.success) {
  throw new Error(
    'EXPO_PUBLIC_API_URL is required for production builds and must include the /v1 API prefix.',
  );
}

if (!__DEV__ && new URL(parsedApiUrl.data).protocol !== 'https:') {
  throw new Error('EXPO_PUBLIC_API_URL must use HTTPS in production builds.');
}

export const env = {
  apiUrl: parsedApiUrl.data.replace(/\/$/, ''),
};
