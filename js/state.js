const appState = {
  route: "today",
  todayDate: "",
  settings: null,
};

const listeners = new Set();

export function getState() {
  return { ...appState };
}

export function patchState(partial) {
  Object.assign(appState, partial);
  for (const listener of listeners) {
    listener(getState());
  }
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
