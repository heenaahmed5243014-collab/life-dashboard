// Small celebrations when something gets ticked off (from the Brain Planner).
const CHEERS = ['Nice one 🎉', 'Ticked. Brain lighter.', 'Look at you go!', 'One less thing ✨', 'Done and dusted.'];
export const cheer = () => CHEERS[Math.floor(Math.random() * CHEERS.length)];
