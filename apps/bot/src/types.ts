/** The Discord user acting on an interaction. */
export interface Actor {
	id: string;
	/** Nickname if set, otherwise global/display name, otherwise username. */
	displayName: string;
	/** True when the member holds Manage Events, Manage Guild, or Administrator. */
	isAdmin: boolean;
	/** Role ids the member holds in this guild; empty outside a guild. */
	roleIds: string[];
}
