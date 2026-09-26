import { BadRequestException, Injectable } from '@nestjs/common';
import type { ParseReminderDto } from './dto/parse-reminder.dto.js';
import { TimeFormatDto } from './dto/parse-reminder.dto.js';
import { ReminderScheduleTypeDto } from './dto/reminder-schedule.dto.js';
import { ReminderScheduleService } from './reminder-schedule.service.js';
import {
  parseReminderResponseSchema,
  type ParseReminderResponse,
} from './schemas/parse-reminder-response.schema.js';

const weekdays: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const months: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

type MutableParse = {
  localDate: string | null;
  localTime: string | null;
  type: ReminderScheduleTypeDto;
  weekdays: number[];
};

@Injectable()
export class ReminderParserService {
  constructor(private readonly schedules: ReminderScheduleService) {}

  parse(dto: ParseReminderDto): ParseReminderResponse {
    try {
      return this.parseDeterministically(dto);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      return this.validateResponse(this.unavailableResponse(dto.text));
    }
  }

  private parseDeterministically(dto: ParseReminderDto): ParseReminderResponse {
    const reference = new Date(dto.referenceInstant);
    if (Number.isNaN(reference.getTime())) {
      throw new BadRequestException('referenceInstant must be a valid RFC 3339 timestamp.');
    }
    const referenceLocal = this.schedules.localPartsAtInstant(reference, dto.timezone);
    const lower = dto.text.toLocaleLowerCase('en-US');
    const parsed: MutableParse = {
      localDate: null,
      localTime: null,
      type: ReminderScheduleTypeDto.ONE_TIME,
      weekdays: [],
    };
    const inferredFields: ParseReminderResponse['inferredFields'] = ['timezone'];
    const ambiguities: ParseReminderResponse['ambiguities'] = [];
    const warnings: ParseReminderResponse['warnings'] = this.unsupportedWarnings(dto.text);
    const alternatives: ParseReminderResponse['supportedAlternatives'] = [];

    const relativeMatch = lower.match(/\bin\s+(\d{1,4})\s+(minute|minutes|hour|hours|day|days)\b/u);
    if (relativeMatch) {
      const amount = Number(relativeMatch[1]);
      const unit = relativeMatch[2]!;
      const multiplier = unit.startsWith('minute')
        ? 60_000
        : unit.startsWith('hour')
          ? 60 * 60_000
          : 24 * 60 * 60_000;
      const target = new Date(reference.getTime() + amount * multiplier);
      const targetLocal = this.schedules.localPartsAtInstant(target, dto.timezone);
      parsed.localDate = targetLocal.date;
      parsed.localTime = targetLocal.time;
      inferredFields.push('date', 'time');
    } else {
      parsed.localDate = this.parseDate(lower, referenceLocal.date);
      if (parsed.localDate) inferredFields.push('date');

      const time = this.parseTime(lower, dto.timeFormat);
      parsed.localTime = time.value;
      if (time.value) inferredFields.push('time');
      if (time.alternatives.length > 0) {
        alternatives.push(...time.alternatives);
        ambiguities.push({
          field: 'time',
          code: 'TIME_MERIDIEM_REQUIRED',
          message: 'Choose whether the stated time is AM or PM.',
          alternativeIds: time.alternatives.map((alternative) => alternative.id),
        });
      }
    }

    this.parseRecurrence(lower, parsed, referenceLocal.date);
    inferredFields.push('recurrence');

    if (!parsed.localDate) {
      ambiguities.push({
        field: 'date',
        code: 'DATE_REQUIRED',
        message: 'Choose an exact date or a supported recurrence start date.',
        alternativeIds: [],
      });
    }
    const daypart = lower.match(/\b(morning|afternoon|evening|night)\b/u)?.[1];
    if (
      !parsed.localTime &&
      daypart &&
      !ambiguities.some((item) => item.field === 'time')
    ) {
      ambiguities.push({
        field: 'time',
        code: 'DAYPART_EXACT_TIME_REQUIRED',
        message: `“${daypart}” is not an exact time. Choose a specific hour and minute.`,
        alternativeIds: [],
      });
    } else if (!parsed.localTime && !ambiguities.some((item) => item.field === 'time')) {
      ambiguities.push({
        field: 'time',
        code: 'EXACT_TIME_REQUIRED',
        message: 'Choose an exact time; broad dayparts are not scheduled automatically.',
        alternativeIds: [],
      });
    }

    const title = this.extractTitle(dto.text);
    if (!title) {
      ambiguities.push({
        field: 'title',
        code: 'TITLE_REQUIRED',
        message: 'Add a short title describing what you want to remember.',
        alternativeIds: [],
      });
    } else if (Array.from(title).length > 120) {
      ambiguities.push({
        field: 'title',
        code: 'TITLE_TOO_LONG',
        message: 'Edit the title to 120 Unicode characters or fewer.',
        alternativeIds: [],
      });
    } else {
      inferredFields.push('title');
    }

    if (!dto.locale.toLowerCase().startsWith('en')) {
      warnings.push({
        code: 'LOCALE_GRAMMAR_LIMITED',
        message: 'Natural-language grammar is currently English-first; review every inferred field.',
        clause: dto.locale,
      });
    }

    const recurrenceSummary = this.recurrenceSummary(parsed.type, parsed.weekdays);
    let preview: ParseReminderResponse['preview'] = null;
    if (
      title &&
      Array.from(title).length <= 120 &&
      parsed.localDate &&
      parsed.localTime &&
      ambiguities.length === 0
    ) {
      try {
        preview = this.schedules.resolve(
          {
            type: parsed.type,
            localDate: parsed.localDate,
            localTime: parsed.localTime,
            timezone: dto.timezone,
            ...(parsed.type === ReminderScheduleTypeDto.SELECTED_WEEKDAYS
              ? { weekdays: parsed.weekdays }
              : {}),
          },
          reference,
        );
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
        ambiguities.push({
          field: 'date',
          code: 'SCHEDULE_NOT_FUTURE',
          message: 'The parsed schedule is not in the future. Choose a future date and time.',
          alternativeIds: [],
        });
      }
    }

    const response: ParseReminderResponse = {
      status: ambiguities.length > 0 ? 'NEEDS_CLARIFICATION' : 'SUCCESS',
      draft: {
        originalText: dto.text,
        preserved: true,
        manualFormAvailable: true,
      },
      structured: {
        title: title && Array.from(title).length <= 120 ? title : null,
        contextNote: null,
        localDate: parsed.localDate,
        localTime: parsed.localTime,
        timezone: dto.timezone,
        recurrence: {
          type: parsed.type,
          weekdays: parsed.weekdays,
          summary: recurrenceSummary,
        },
      },
      preview,
      confidence: {
        title: title ? 0.9 : 0,
        date: parsed.localDate ? 0.95 : 0,
        time: parsed.localTime ? 0.95 : 0,
        timezone: 1,
        recurrence: 0.95,
      },
      inferredFields: [...new Set(inferredFields)],
      ambiguities,
      warnings,
      supportedAlternatives: alternatives,
      requiresConfirmation: true,
      created: false,
    };
    return this.validateResponse(response);
  }

  private parseDate(lower: string, referenceDate: string): string | null {
    const iso = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/u)?.[1];
    if (iso) return iso;
    if (/\btomorrow\b/u.test(lower)) return this.schedules.addLocalDays(referenceDate, 1);
    if (/\btoday\b/u.test(lower)) return referenceDate;

    const monthMatch = lower.match(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/u,
    );
    if (monthMatch) {
      const referenceYear = Number(referenceDate.slice(0, 4));
      const month = months[monthMatch[1]!]!;
      const day = Number(monthMatch[2]);
      const year = monthMatch[3] ? Number(monthMatch[3]) : referenceYear;
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    const weekdayMatch = lower.match(
      /\b(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/u,
    );
    if (weekdayMatch) {
      const target = weekdays[weekdayMatch[1]!]!;
      const current = this.schedules.weekdayForDate(referenceDate);
      let delta = (target - current + 7) % 7;
      if (lower.includes(`next ${weekdayMatch[1]}`) || delta === 0) delta = delta || 7;
      return this.schedules.addLocalDays(referenceDate, delta);
    }
    return null;
  }

  private parseTime(lower: string, format: TimeFormatDto) {
    const alternatives: ParseReminderResponse['supportedAlternatives'] = [];
    const meridiem = lower.match(/\bat\s+(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m\.?\b/u);
    if (meridiem) {
      const rawHour = Number(meridiem[1]);
      if (rawHour < 1 || rawHour > 12) return { value: null, alternatives };
      const minute = Number(meridiem[2] ?? '0');
      const hour = (rawHour % 12) + (meridiem[3] === 'p' ? 12 : 0);
      return { value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, alternatives };
    }

    const exact = lower.match(/\bat\s+([01]?\d|2[0-3]):([0-5]\d)\b/u);
    if (exact) {
      return {
        value: `${String(Number(exact[1])).padStart(2, '0')}:${exact[2]}`,
        alternatives,
      };
    }

    const bare = lower.match(/\bat\s+(\d{1,2})(?!\s*:)\b/u);
    if (!bare) return { value: null, alternatives };
    const hour = Number(bare[1]);
    if (format === TimeFormatDto.TWENTY_FOUR_HOUR && hour <= 23) {
      return { value: `${String(hour).padStart(2, '0')}:00`, alternatives };
    }
    if (hour >= 1 && hour <= 12) {
      const morning = `${String(hour % 12).padStart(2, '0')}:00`;
      const evening = `${String((hour % 12) + 12).padStart(2, '0')}:00`;
      alternatives.push(
        { id: 'time-am', label: `${hour}:00 AM`, patch: { localTime: morning } },
        { id: 'time-pm', label: `${hour}:00 PM`, patch: { localTime: evening } },
      );
    }
    return { value: null, alternatives };
  }

  private parseRecurrence(lower: string, parsed: MutableParse, referenceDate: string): void {
    if (/\b(?:every day|daily)\b/u.test(lower)) {
      parsed.type = ReminderScheduleTypeDto.DAILY;
      parsed.localDate ??= referenceDate;
      return;
    }

    const mentioned = Object.entries(weekdays)
      .filter(([name]) => new RegExp(`\\b${name}\\b`, 'u').test(lower))
      .map(([, value]) => value);
    if (/\bevery\b/u.test(lower) && mentioned.length > 1) {
      parsed.type = ReminderScheduleTypeDto.SELECTED_WEEKDAYS;
      parsed.weekdays = [...new Set(mentioned)].sort((left, right) => left - right);
      parsed.localDate ??= referenceDate;
      return;
    }
    if (/\b(?:every week|weekly)\b/u.test(lower) || (/\bevery\b/u.test(lower) && mentioned.length === 1)) {
      parsed.type = ReminderScheduleTypeDto.WEEKLY;
      parsed.localDate ??= referenceDate;
    }
  }

  private extractTitle(original: string): string | null {
    const normalized = original.normalize('NFC').trim().replace(/[.!?]+$/u, '');
    const captured = normalized.match(/^remind me\b.*?\bto\s+(.+)$/iu)?.[1] ?? normalized;
    const stripped = captured
      .replace(/^remind me(?:\s+to)?\s+/iu, '')
      .replace(/\b(?:today|tomorrow)\b/giu, ' ')
      .replace(/\bnext\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/giu, ' ')
      .replace(/\b(?:every day|daily|every week|weekly)\b/giu, ' ')
      .replace(/\bevery\s+(?:(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s*,\s*|\s+and\s+|\s+)*)+/giu, ' ')
      .replace(/\bin\s+\d{1,4}\s+(?:minutes?|hours?|days?)\b/giu, ' ')
      .replace(/\b\d{4}-\d{2}-\d{2}\b/gu, ' ')
      .replace(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,?\s+\d{4})?\b/giu, ' ')
      .replace(/\bat\s+\d{1,2}(?::[0-5]\d)?\s*(?:[ap]\.?m\.?)?\b/giu, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
    return stripped.length > 0 ? stripped : null;
  }

  private unsupportedWarnings(original: string): ParseReminderResponse['warnings'] {
    const patterns = [
      { code: 'LOCATION_TRIGGER_UNAVAILABLE', expression: /\bwhen I (?:arrive|leave|get to)[^,.!?]*/giu },
      { code: 'DEVICE_TRIGGER_UNAVAILABLE', expression: /\bwhen (?:my )?(?:phone|device)[^,.!?]*/giu },
      { code: 'DEVICE_TRIGGER_UNAVAILABLE', expression: /\bwhen (?:charging|connected to (?:wi-?fi|bluetooth))[^,.!?]*/giu },
      { code: 'INTEGRATION_UNAVAILABLE', expression: /\b(?:via|through)\s+(?:whatsapp|telegram|slack|email|sms)[^,.!?]*/giu },
      { code: 'INTEGRATION_UNAVAILABLE', expression: /\badd (?:it|this) to (?:my )?calendar[^,.!?]*/giu },
    ] as const;
    return patterns.flatMap(({ code, expression }) =>
      [...original.matchAll(expression)].map((match) => ({
        code,
        clause: Array.from(match[0].trim()).slice(0, 500).join(''),
        message:
          code === 'LOCATION_TRIGGER_UNAVAILABLE'
            ? 'Location-based triggers are unavailable in the MVP; choose a time instead.'
            : code === 'DEVICE_TRIGGER_UNAVAILABLE'
              ? 'Device-state triggers are unavailable in the MVP; choose a time instead.'
              : 'External integrations are unavailable in the MVP; the clause was kept for review.',
      })),
    );
  }

  private recurrenceSummary(type: ReminderScheduleTypeDto, selected: number[]): string {
    if (type === ReminderScheduleTypeDto.ONE_TIME) return 'Once';
    if (type === ReminderScheduleTypeDto.DAILY) return 'Every day';
    if (type === ReminderScheduleTypeDto.WEEKLY) return 'Every week';
    const names = Object.entries(weekdays)
      .filter(([, value]) => selected.includes(value))
      .map(([name]) => name[0]!.toUpperCase() + name.slice(1));
    return `Every ${names.join(', ')}`;
  }

  private unavailableResponse(text: string): ParseReminderResponse {
    return {
      status: 'UNAVAILABLE',
      draft: { originalText: text, preserved: true, manualFormAvailable: true },
      structured: null,
      preview: null,
      confidence: { title: 0, date: 0, time: 0, timezone: 0, recurrence: 0 },
      inferredFields: [],
      ambiguities: [],
      warnings: [
        {
          code: 'PARSER_UNAVAILABLE',
          message: 'Parsing is temporarily unavailable. Your draft is preserved for the manual form.',
          clause: null,
        },
      ],
      supportedAlternatives: [],
      requiresConfirmation: true,
      created: false,
    };
  }

  private validateResponse(response: ParseReminderResponse): ParseReminderResponse {
    const result = parseReminderResponseSchema.safeParse(response);
    if (!result.success) {
      throw new Error(`Parser produced an invalid bounded response: ${result.error.message}`);
    }
    return result.data;
  }
}
