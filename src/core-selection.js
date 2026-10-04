export function selectCore(system, providers) {
  const provider = providers.find(provider => provider.systems.includes(system));
  if (!provider) throw new Error(`No provider installed for ${system}.`);
  return provider;
}
