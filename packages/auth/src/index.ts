export { type Auth, auth, type Session, type SessionUser } from "./auth";
export { isGoogleConfigured } from "./env";
export {
	canChangeRole,
	canRenameWorkspace,
	DEFAULT_WORKSPACE_NAME,
	ensureWorkspaceMembership,
	isWorkspaceAdmin,
	isWorkspaceRole,
	WORKSPACE_ID,
	WORKSPACE_ROLES,
	WORKSPACE_SLUG,
	type WorkspaceRole,
} from "./organization";
export {
	CALENDAR_SCOPE,
	GMAIL_SCOPE,
	GOOGLE_PROVIDER_ID,
	hasSyncScopes,
	IDENTITY_SCOPES,
	needsGoogleGrant,
	parseScopes,
	REQUIRED_SCOPES,
	type SignInAccount,
	SYNC_SCOPES,
	signsInWithGoogle,
} from "./scopes";
export { onSignedIn, type SignedInHandler } from "./signed-in";
export {
	canConfigureSso,
	ssoCallbackBase,
	ssoCallbackURL,
	ssoProviderName,
} from "./sso";
export {
	hasSignInAllowList,
	isWorkspaceEmail,
	primaryWorkspaceDomain,
	workspaceDomains,
} from "./workspace";
