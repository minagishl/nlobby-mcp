export interface NLobbyUser {
  id: string;
  email: string;
  name: string;
  type: "student" | "parent" | "staff";
  avatar?: string;
}

export interface NLobbySession {
  user: NLobbyUser;
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  sessionToken?: string;
  csrfToken?: string;
  callbackUrl?: string;
}

export interface NLobbyAnnouncement {
  id: string;
  title: string;
  content?: string;
  publishedAt: Date;
  category: string;
  priority: "low" | "medium" | "high";
  targetAudience: ("student" | "parent" | "staff")[];
  menuName?: string;
  isImportant?: boolean;
  isUnread?: boolean;
  url?: string;
}

export interface NLobbyNewsDetail {
  id: string;
  microCmsId?: string;
  title: string;
  content: string; // HTML content
  description?: string; // Plain text description
  publishedAt: Date;
  menuName: string[];
  isImportant: boolean;
  isByMentor: boolean;
  attachments?: {
    href: string;
    fileName: string;
    downloadFileName: string;
  }[];
  relatedEvents?: {
    microCmsId: string;
    dateTimes: string[];
    deadlineDate?: string;
    cardMake: {
      href: string;
      category: string;
      title: string;
    };
    chips: {
      label: string;
      color: string;
    }[];
    imgObject?: {
      url: string;
      alt: string;
    };
  }[];
  targetUserQueryId?: string;
  url: string;
}

export interface NLobbyScheduleItem {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  type: "class" | "event" | "meeting" | "exam";
  participants?: string[];
}

// Google Calendar API types
export enum CalendarType {
  PERSONAL = "personal",
  SCHOOL = "school",
}

export interface GoogleCalendarDateTime {
  date?: string; // YYYY-MM-DD format for all-day events
  dateTime?: string; // ISO 8601 format with timezone
  timeZone?: string;
}

export interface GoogleCalendarAttendee {
  email: string;
  displayName?: string;
  organizer?: boolean;
  self?: boolean;
  responseStatus: "needsAction" | "declined" | "tentative" | "accepted";
  comment?: string;
  optional?: boolean;
}

export interface GoogleCalendarCreator {
  email: string;
  displayName?: string;
  self?: boolean;
}

export interface GoogleCalendarReminder {
  useDefault: boolean;
  overrides?: Array<{
    method: "email" | "popup";
    minutes: number;
  }>;
}

export interface GoogleCalendarConferenceData {
  entryPoints?: Array<{
    entryPointType: "video" | "phone" | "more";
    uri: string;
    label?: string;
    meetingCode?: string;
    passcode?: string;
    regionCode?: string;
  }>;
  conferenceSolution?: {
    key: { type: string };
    name: string;
    iconUri?: string;
  };
  conferenceId?: string;
  notes?: string;
  parameters?: Record<string, unknown>;
}

export interface GoogleCalendarEvent {
  kind: string;
  etag: string;
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  htmlLink: string;
  created: string;
  updated: string;
  summary: string;
  description?: string;
  location?: string;
  creator: GoogleCalendarCreator;
  organizer: GoogleCalendarCreator;
  start: GoogleCalendarDateTime;
  end: GoogleCalendarDateTime;
  recurringEventId?: string;
  originalStartTime?: GoogleCalendarDateTime;
  visibility?: "default" | "public" | "private" | "confidential";
  iCalUID: string;
  sequence: number;
  attendees?: GoogleCalendarAttendee[];
  guestsCanInviteOthers?: boolean;
  guestsCanSeeOtherGuests?: boolean;
  guestsCanModify?: boolean;
  reminders: GoogleCalendarReminder;
  eventType: "default" | "outOfOffice" | "focusTime";
  conferenceData?: GoogleCalendarConferenceData;
  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
  attachments?: Array<{
    fileUrl: string;
    title: string;
    mimeType?: string;
    iconLink?: string;
    fileId?: string;
  }>;
}

export interface GoogleCalendarResponse {
  result: {
    data: {
      gcal: GoogleCalendarEvent[];
    };
  };
}

export interface CalendarDateRange {
  from: Date;
  to: Date;
}

export interface NLobbyLearningResource {
  id: string;
  title: string;
  description: string;
  type: "document" | "video" | "assignment" | "quiz";
  url: string;
  subject: string;
  grade?: string;
  publishedAt: Date;
}

export interface CourseReportDetail {
  number: number;
  progress: number;
  score: number | null;
  expiration: string;
}

export interface CourseReport {
  count: number;
  allCount: number;
}

export interface CourseSchooling {
  attendanceCount: number;
  entryCount: number;
  necessaryCount: number;
}

export interface CourseTest {
  examStatus: number;
  periodicExamResult: number | null;
  makeupExamUrl: string | null;
}

export interface CourseAcquired {
  acquisitionStatus: number;
  academicCredit: number;
  approvedCredit: number;
  evaluation: string | null;
  criterionReferencedEvaluation: string | null;
}

export interface NLobbyRequiredCourse {
  curriculumCode: string;
  curriculumName: string;
  subjectCode: string;
  subjectName: string;
  subjectStatus: number;
  previousRegistration: boolean;
  report: CourseReport;
  reportDetails: CourseReportDetail[];
  schooling: CourseSchooling;
  test: CourseTest;
  acquired: CourseAcquired;
  // Additional computed fields for convenience
  termYear?: number;
  grade?: string;
  term?: number;
  progressPercentage?: number;
  averageScore?: number | null;
  isCompleted?: boolean;
  isInProgress?: boolean;
  [key: string]: unknown;
}

export interface TermYear {
  termYear: number;
  grade: string;
  term: number;
  subjectStatus: number;
  entryAvailability: boolean;
  entryStatus: number;
  testDetailDestinationUrl: string | null;
  courses: NLobbyRequiredCourse[];
}

export interface PreviousRegistration {
  previousRegistrationAcademicCredit: number;
  previousRegistrationCredit: number;
}

export interface EducationData {
  educationProcessName: string;
  previousRegistration: PreviousRegistration;
  termYears: TermYear[];
}

export interface NLobbyApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Specific API response types based on actual usage patterns
export interface TRPCResponse<T = unknown> {
  result?: {
    data?: T;
    [key: string]: unknown;
  };
  data?: T;
  [key: string]: unknown;
}

export interface CalendarApiResponse extends TRPCResponse {
  result?: {
    data?: {
      gcal?: GoogleCalendarEvent[];
      lcal?: GoogleCalendarEvent[];
      [key: string]: unknown;
    };
  };
  data?: {
    gcal?: GoogleCalendarEvent[];
    [key: string]: unknown;
  };
}

export interface EducationApiResponse extends TRPCResponse {
  result?: {
    data?: EducationData;
  };
}

export interface NewsApiResponse extends TRPCResponse {
  result?: {
    data?: NLobbyNewsDetail[];
  };
}

export interface UserApiResponse extends TRPCResponse {
  result?: {
    data?: {
      id?: string;
      email?: string;
      name?: string;
      role?: string;
      [key: string]: unknown;
    };
  };
}

export interface StandardApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

// News data parsing types
export interface NewsData {
  id?: string;
  microCmsId?: string;
  title?: string;
  description?: string;
  publishedAt?: string;
  menuName?: string[];
  isImportant?: boolean;
  isByMentor?: boolean;
  attachments?: Array<{
    href: string;
    fileName: string;
    downloadFileName: string;
  }>;
  relatedEvents?: Array<{
    microCmsId: string;
    dateTimes: string[];
    deadlineDate?: string;
    cardMake: {
      href: string;
      category: string;
      title: string;
    };
    chips: Array<{
      label: string;
      color: string;
    }>;
    imgObject?: {
      url: string;
      alt: string;
    };
  }>;
  targetUserQueryId?: string;
  [key: string]: unknown;
}

// Calendar event types for conversion
export interface CalendarEvent {
  id?: string;
  microCmsId?: string;
  summary?: string;
  title?: string;
  description?: string;
  location?: string;
  start?: {
    dateTime?: string;
    date?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
  };
  startDateTime?: string;
  endDateTime?: string;
  attendees?: Array<{
    email: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

// Axios error types
export interface AxiosErrorResponse {
  status?: number;
  statusText?: string;
  data?: unknown;
  headers?: Record<string, string>;
}

export interface AxiosErrorConfig {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface AxiosError {
  response?: AxiosErrorResponse;
  config?: AxiosErrorConfig;
  message?: string;
  [key: string]: unknown;
}

// DOM parsing types
export interface CheerioElement {
  [key: string]: unknown;
}

// API response data types
export interface ApiResponseData {
  result?: {
    data?: {
      gcal?: GoogleCalendarEvent[];
      lcal?: GoogleCalendarEvent[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  data?: {
    gcal?: GoogleCalendarEvent[];
    lcal?: GoogleCalendarEvent[];
    [key: string]: unknown;
  };
  gcal?: GoogleCalendarEvent[];
  [key: string]: unknown;
}

// Education API response types
export interface EducationApiResponseData {
  result?: {
    data?: EducationData;
    [key: string]: unknown;
  };
  data?: EducationData;
  educationProcessName?: string;
  termYears?: TermYear[];
  [key: string]: unknown;
}

// News item transformation types
export interface NewsItem {
  id?: string | number;
  title?: string;
  name?: string;
  subject?: string;
  heading?: string;
  content?: string;
  description?: string;
  body?: string;
  text?: string;
  summary?: string;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  date?: string;
  category?: string;
  menuName?: string;
  type?: string;
  classification?: string;
  isImportant?: boolean;
  important?: boolean;
  priority?: string;
  urgent?: boolean;
  minor?: boolean;
  targetAudience?: string[];
  [key: string]: unknown;
}

// Course types for server.ts
export interface Course {
  id?: string;
  grade?: string;
  curriculumName?: string;
  termYear?: number | string;
  isCompleted?: boolean;
  isInProgress?: boolean;
  curriculumCode?: string;
  subjectCode?: string;
  subjectName?: string;
  subjectStatus?: number;
  previousRegistration?: boolean;
  report?: CourseReport;
  reportDetails?: CourseReportDetail[];
  schooling?: CourseSchooling;
  test?: CourseTest;
  acquired?: CourseAcquired;
  progressPercentage?: number;
  averageScore?: number | null;
  [key: string]: unknown;
}

// Network error types for trpc-client.ts
export interface NetworkError {
  code?: string;
  message?: string;
  [key: string]: unknown;
}
