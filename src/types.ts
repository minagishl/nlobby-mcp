export interface NLobbyUser {
	id: string;
	email: string;
	name: string;
	type: 'student' | 'parent' | 'staff';
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
	priority: 'low' | 'medium' | 'high';
	targetAudience: ('student' | 'parent' | 'staff')[];
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
	type: 'class' | 'event' | 'meeting' | 'exam';
	participants?: string[];
}

// Google Calendar API types
export enum CalendarType {
	PERSONAL = 'personal',
	SCHOOL = 'school',
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
	responseStatus: 'needsAction' | 'declined' | 'tentative' | 'accepted';
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
		method: 'email' | 'popup';
		minutes: number;
	}>;
}

export interface GoogleCalendarConferenceData {
	entryPoints?: Array<{
		entryPointType: 'video' | 'phone' | 'more';
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
	parameters?: any;
}

export interface GoogleCalendarEvent {
	kind: string;
	etag: string;
	id: string;
	status: 'confirmed' | 'tentative' | 'cancelled';
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
	visibility?: 'default' | 'public' | 'private' | 'confidential';
	iCalUID: string;
	sequence: number;
	attendees?: GoogleCalendarAttendee[];
	guestsCanInviteOthers?: boolean;
	guestsCanSeeOtherGuests?: boolean;
	guestsCanModify?: boolean;
	reminders: GoogleCalendarReminder;
	eventType: 'default' | 'outOfOffice' | 'focusTime';
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
	type: 'document' | 'video' | 'assignment' | 'quiz';
	url: string;
	subject: string;
	grade?: string;
	publishedAt: Date;
}

export interface NLobbyApiResponse<T = any> {
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
