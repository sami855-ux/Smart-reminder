import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { ApiError } from '../api/errors';
import type { AccountExport } from './auth.schemas';

export async function shareAccountExport(data: AccountExport): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new ApiError(
      'Sharing is unavailable on this device.',
      'SHARING_UNAVAILABLE',
      null,
      null,
      false,
    );
  }

  const file = new File(
    Paths.cache,
    `smart-reminder-export-${new Date().toISOString().slice(0, 10)}.json`,
  );

  try {
    file.create({ overwrite: true });
    file.write(JSON.stringify(data, null, 2));
    await Sharing.shareAsync(file.uri, {
      dialogTitle: 'Export Smart Reminder data',
      mimeType: 'application/json',
      UTI: 'public.json',
    });
  } finally {
    if (file.exists) file.delete();
  }
}
