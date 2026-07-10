import { google } from 'googleapis';

interface CalendarCreds {
  clientEmail: string;
  privateKey: string;
  calendarId: string;
}

/**
 * Service-account auth against Google Calendar. The private key arrives from
 * Cloudflare secrets with literal `\n` sequences — replace them before use.
 */
function getCalendarClient(creds: CalendarCreds) {
  const auth = new google.auth.JWT({
    email: creds.clientEmail,
    key: creds.privateKey.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

export async function listBusySlots(creds: CalendarCreds, timeMinISO: string, timeMaxISO: string) {
  const calendar = getCalendarClient(creds);
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      items: [{ id: creds.calendarId }],
    },
  });
  return res.data.calendars?.[creds.calendarId]?.busy ?? [];
}

export async function createBookingEvent(
  creds: CalendarCreds,
  opts: { summary: string; description: string; startISO: string; endISO: string; timeZone?: string }
) {
  const calendar = getCalendarClient(creds);
  const timeZone = opts.timeZone ?? 'Europe/Dublin';
  const res = await calendar.events.insert({
    calendarId: creds.calendarId,
    requestBody: {
      summary: opts.summary,
      description: opts.description,
      start: { dateTime: opts.startISO, timeZone },
      end: { dateTime: opts.endISO, timeZone },
    },
  });
  return res.data;
}
