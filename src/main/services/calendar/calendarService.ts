import { v4 as uuid } from 'uuid';
import { focusStore } from '../store';
import type { CalendarEvent } from '../../../shared/schema/index';

export const calendarService = {
  list(from: number, to: number): CalendarEvent[] {
    return focusStore.get('calendarEvents').filter(e => e.start >= from && e.start <= to);
  },

  create(opts: Omit<CalendarEvent, 'id'>): CalendarEvent {
    const event: CalendarEvent = { id: uuid(), ...opts };
    focusStore.addCalendarEvent(event);
    return event;
  },

  delete(id: string): void {
    focusStore.set('calendarEvents', focusStore.get('calendarEvents').filter(e => e.id !== id));
  },
};
