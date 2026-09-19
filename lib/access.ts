export type AccessMode = {
  ready: boolean;
  isPlayer: boolean;
  agentId: string | null;
};

export function parseAccessMode(search: string): AccessMode {
  const params = new URLSearchParams(search);
  return {
    ready: true,
    isPlayer: params.get("mode") === "player",
    agentId: params.get("agent"),
  };
}

export function canAccessAgent(access: AccessMode, id: string) {
  return !access.isPlayer || (!!access.agentId && access.agentId === id);
}

export function accessHref(target: string, access: AccessMode) {
  if (!access.isPlayer || !access.agentId) return target;
  const separator = target.includes("?") ? "&" : "?";
  return `${target}${separator}mode=player&agent=${encodeURIComponent(access.agentId)}`;
}
