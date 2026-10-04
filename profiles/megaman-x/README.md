# Mega Man X profile qualification

SNES content can be passed to the bsnes provider. A verified Mega Man X semantic profile is **not supplied**. Do not label arbitrary RAM as health, actors or progression.

Required evidence: exact ROM SHA-256 and revision; legal local content; exposed bsnes memory descriptors; verified address, width, signedness, endian, units and range for every field; actor slot generation/lifetime rules; snapshots at title screen, playable stage, damage, death and checkpoint transitions. No commercial ROM is distributed here.

Use the game-profile contract for explicitly verified meter, spatial and neutral descriptor fields. Actor/character/player domains are installed, but automatic actor-slot decoding and progression mapping remain unqualified. Add that behavior to the observed-game-state adapter Kit with lifecycle tests before claiming support.
