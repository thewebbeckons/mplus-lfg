export type Role = 'TANK' | 'HEALER' | 'DPS';

export type GroupStatus = 'OPEN' | 'FULL' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';

/** Minimal per-server configuration stored in D1. */
export interface GuildConfigRow {
	guild_id: string;
	channel_id: string;
	/** IANA zone name, e.g. `America/Toronto`. */
	timezone: string;
}

/** Row shape of `mplus_groups`. */
export interface GroupRow {
	id: string;
	guild_id: string;
	channel_id: string;
	message_id: string | null;
	creator_id: string;
	activity: string;
	start_time: string;
	start_ts: number | null;
	notes: string | null;
	/** Total slots per role, including the creator and any reserved slots. */
	tank_needed: number;
	healer_needed: number;
	dps_needed: number;
	/** Slots already covered by a premade, occupying capacity without a signup row. */
	tank_reserved: number;
	healer_reserved: number;
	dps_reserved: number;
	status: GroupStatus;
	created_at: number;
}

/** Row shape of `mplus_signups`. */
export interface SignupRow {
	id: number;
	group_id: string;
	user_id: string;
	username: string;
	role: Role;
	signed_at: number;
}

/** A group plus its full roster — everything needed to render the message. */
export interface GroupState {
	group: GroupRow;
	signups: SignupRow[];
}

/** Slot counts keyed by role. */
export type Composition = Record<Role, number>;

/**
 * What the creator asked for: the whole party, and how much of it they had
 * already assembled before posting.
 */
export interface PartyPlan {
	/** Total slots per role, creator included. */
	total: Composition;
	/** Slots already covered outside Discord, creator excluded. */
	reserved: Composition;
}

/** The Discord user acting on an interaction. */
export interface Actor {
	id: string;
	/** Nickname if set, otherwise global/display name, otherwise username. */
	displayName: string;
	/** True when the member holds Manage Events, Manage Guild, or Administrator. */
	isAdmin: boolean;
}
