import type { State } from "./model";
import { removeParticipant } from "./combat";
export function withoutAgent(state: State, id: string): State {
  return {
    ...state,
    agents: state.agents.filter((a) => a.id !== id),
    encounters: state.encounters.map((e) =>
      e.participants
        .filter((p) => p.agentId === id)
        .reduce((next, p) => removeParticipant(next, p.id), e),
    ),
  };
}
