// Bot Configuration
export const BOT_PREFIX = '.';
export const TEST_USER_ID = '583340515869589522';

// Timeouts
export const CONSENT_TIMEOUT = 60000; // 1 minute
export const TRAIT_TIMEOUT = 60000; // 1 minute
export const BRINK_TIMEOUT = 60000; // 1 minute
export const MARTYRDOM_TIMEOUT = 300000; // 5 minutes
export const CONFLICT_TIMEOUT = 15000; // 15 seconds
export const GM_REMINDER_TIMES = [120000, 300000, 600000, 1200000]; // 2, 5, 10, 20 minutes in milliseconds

// Embed Colors
export const CONFLICT_EMBED_COLOR_INITIAL = 0xFFA500; // Orange - Default/Pending
export const CONFLICT_EMBED_COLOR_SUCCESS = 0x00FF00; // Green - Success
export const CONFLICT_EMBED_COLOR_FAILURE = 0xFF0000; // Red - Failure
export const CONFLICT_EMBED_COLOR_SACRIFICE = 0x8B0000; // Dark Red - Sacrifice Offered

// Emojis
export const DEFAULT_LIT_CANDLE_EMOJI = ':candle:';
export const DEFAULT_UNLIT_CANDLE_EMOJI = ':wavy_dash:';

// TTS and Language Options
export const languageOptions = {
  'en-US': {
    name: 'English (US)',
    voices: {
      'en-US-Standard-A': { name: 'Standard A', ssmlGender: 'FEMALE' },
      'en-US-Standard-B': { name: 'Standard B', ssmlGender: 'MALE' },
      'en-US-Standard-C': { name: 'Standard C', ssmlGender: 'FEMALE' },
      'en-US-Standard-D': { name: 'Standard D', ssmlGender: 'MALE' },
      'en-US-Neural2-A': { name: 'Neural2 A', ssmlGender: 'FEMALE' },
      'en-US-Neural2-B': { name: 'Neural2 B', ssmlGender: 'MALE' },
      'en-US-Neural2-C': { name: 'Neural2 C', ssmlGender: 'FEMALE' },
      'en-US-Neural2-D': { name: 'Neural2 D', ssmlGender: 'MALE' },
      'en-US-Neural2-E': { name: 'Neural2 E', ssmlGender: 'FEMALE' },
      'en-US-Neural2-F': { name: 'Neural2 F', ssmlGender: 'MALE' },
      'en-US-Neural2-G': { name: 'Neural2 G', ssmlGender: 'FEMALE' },
      'en-US-Neural2-H': { name: 'Neural2 H', ssmlGender: 'MALE' },
      'en-US-Neural2-I': { name: 'Neural2 I', ssmlGender: 'FEMALE' },
      'en-US-Neural2-J': { name: 'Neural2 J', ssmlGender: 'MALE' },
    },
  },
  'en-GB': {
    name: 'English (GB)',
    voices: {
      'en-GB-Neural2-A': { name: 'Neural2 A', ssmlGender: 'FEMALE' },
      'en-GB-Neural2-B': { name: 'Neural2 B', ssmlGender: 'MALE' },
      'en-GB-Neural2-C': { name: 'Neural2 C', ssmlGender: 'FEMALE' },
      'en-GB-Neural2-D': { name: 'Neural2 D', ssmlGender: 'MALE' },
      'en-GB-Neural2-F': { name: 'Neural2 F', ssmlGender: 'FEMALE' },
    },
  },
  'es-ES': {
    name: 'Spanish (ES)',
    voices: {
      'es-ES-Standard-A': { name: 'Standard A', ssmlGender: 'FEMALE' },
      'es-ES-Standard-B': { name: 'Standard B', ssmlGender: 'MALE' },
      'es-ES-Neural2-A': { name: 'Neural2 A', ssmlGender: 'FEMALE' },
      'es-ES-Neural2-B': { name: 'Neural2 B', ssmlGender: 'MALE' },
    },
  },
  'fr-FR': {
    name: 'French (FR)',
    voices: {
      'fr-FR-Standard-A': { name: 'Standard A', ssmlGender: 'FEMALE' },
      'fr-FR-Standard-B': { name: 'Standard B', ssmlGender: 'MALE' },
      'fr-FR-Standard-C': { name: 'Standard C', ssmlGender: 'FEMALE' },
      'fr-FR-Standard-D': { name: 'Standard D', ssmlGender: 'MALE' },
      'fr-FR-Neural2-A': { name: 'Neural2 A', ssmlGender: 'FEMALE' },
      'fr-FR-Neural2-B': { name: 'Neural2 B', ssmlGender: 'MALE' },
      'fr-FR-Neural2-C': { name: 'Neural2 C', ssmlGender: 'FEMALE' },
      'fr-FR-Neural2-D': { name: 'Neural2 D', ssmlGender: 'MALE' },
    },
  },
  'de-DE': {
    name: 'German (DE)',
    voices: {
      'de-DE-Standard-A': { name: 'Standard A', ssmlGender: 'FEMALE' },
      'de-DE-Standard-B': { name: 'Standard B', ssmlGender: 'MALE' },
      'de-DE-Neural2-A': { name: 'Neural2 A', ssmlGender: 'FEMALE' },
      'de-DE-Neural2-B': { name: 'Neural2 B', ssmlGender: 'MALE' },
    },
  },
  // Add additional languages here...
};

// Default / Random Values (Traits, Brinks, etc.)
export const defaultVirtues = [
  'courageous', 'compassionate', 'just', 'wise', 'temperate', 'hopeful', 'faithful', 'loving', 'loyal', 'honest',
  'generous', 'patient', 'diligent', 'forgiving', 'kind', 'optimistic', 'reliable', 'respectful', 'selfless', 'sincere',
  'tolerant', 'trustworthy', 'understanding', 'vigilant', 'witty', 'adaptable', 'ambitious', 'charitable', 'creative', 'decisive'
];

export const defaultVices = [
  'greedy', 'wrathful', 'envious', 'slothful', 'proud', 'gluttonous', 'lustful', 'treacherous', 'deceitful', 'cowardly',
  'jealous', 'malicious', 'pessimistic', 'reckless', 'resentful', 'rude', 'selfish', 'stubborn', 'suspicious', 'vain',
  'vengeful', 'wasteful', 'withdrawn', 'arrogant', 'bitter', 'careless', 'cruel', 'dishonest', 'frivolous', 'hateful'
];

export const defaultThemes = [
  // Note, keep "description" field under 1024 characters for embed
  {
    title: "STRANGE AEONS",
    description: "Even before the darkness, Arkham whispered tales of strange cults, men driven mad by arcane knowledge, and unspeakable acts. When the darkness finally came, fear turned neighbor against neighbor, and people began vanishing. Yet, a sliver of hope remains. You and a few others survived, sustained by the belief that answers can be found. Perhaps forbidden knowledge lies hidden in occult tomes, or insights can be gleaned from the prophetic dreams of asylum inmates. Or maybe the truth requires confronting the evil believed to dwell in the shadowed places beyond the town.\nGoal: Learn more about Them and what darkened the sky."
  },
  {
    title: "LIVING IN DARKNESS",
    description: "Dad blames commies, Mom's quiet. Five days ago, people started disappearing – neighbors, classmates. Gone. Then soldiers came, forcing everyone into trucks, taking you all to city hall. No TV, no radio, but your walkie-talkie still works. You and your friends talk after curfew, agreeing someone needs to do something. The adults seem resigned, but you're not. Mr. Guthrie, the town historian, might know what's happening. His house is across town, past the cemetery, and the soldiers have blocked the roads. It's risky, especially after dark, but someone has to find answers. That someone is you.\nGoal: Talk to Mr Guthrie and figure out what's going on.\nPlay Note: For this module, all the characters are kids or young teenagers."
  },
  {
    title: "THE USS LEVIATHAN",
    description: "After waking from stasis, the captain explained: the ship detected an anomaly, dropped from hyperspace, and woke the crew. But the viewports show nothing – no stars, no planets. Just void. It's as if the Leviathan sailed out of the universe. Five days pass checking instruments, taking readings, while supplies dwindle. Then crew members started disappearing. Bowman, Parker, others. Only a handful remain. Some suspect something is aboard, lurking. The ship grows colder; power cells are failing. Soon it'll be dark inside too. Maybe accessing the central computer holds answers? Or perhaps boosting the main power with batteries from the surface vehicles could buy time? Scanners also show a strange gravitational anomaly nearby. Reaching it would take most remaining power, but it might be your only shot.\nGoals: Try to boost the power cells or investigate the gravitational anomaly."
  },
  {
    title: "INTO THE ABYSS",
    description: "The attack by the forsaken barbarians was swift and brutal. We fought, but were overwhelmed. The king fell. Survival became the only goal. Fleeing towards a narrow defile, we found an entrance in the rock face. In our desperation, we ignored the strange symbols above it and rushed inside, even as our pursuers hesitated. Since then, only darkness and fear. We wander sunless depths, hoping for an exit. Time loses meaning. One by one, companions are dragged screaming into the shadows by foul things. Two days ago, we found a crude map carved on black stone. Hope flickered – it seems to show a way out, and also a vast chamber marked with a rune for 'power'. Perhaps a weapon lies there? Food is gone, water scarce, few torches remain. We must find an escape or perish.\nGoals: Find a way out of the mountain, or find a way to destroy *them*."
  },
  {
  title: "BURNING MAN",
  description: "When darkness fell at the start of Burning Man, people cheered – an end to desert heat, the start of endless night parties. But then generators failed, sound systems died, and the casual crowd left. Creepy rumors spread among the remaining few: disappearances, strange things lurking in the dark. Dismissed as paranoia, until suddenly, chaos erupted. They hunted you in the shadows. Panic flared – camps burned for light, desperate car escapes ended in screams, then silence. Now, only silence and darkness remain. You're huddled in your camp's main tent, clinging to the last of the light from lamps and torches. You know They are still out there. Peeking outside, you see some large art pieces dimly, erratically lit, revealing The Man still standing majestically, untouched amidst the panic. Why it wasn't burned gives you chills. Your last torches are fading. Food and water are gone. You need light to survive. It's time to go out. It's time to set The Man on fire.\nGoal: Set the Effigy ablaze."
  }
]

export const defaultMoments = [
  "Find a way to signal for help.",
  "Locate a safe place to rest.",
  "Protect a vulnerable person.",
  "Discover the source of the strange noises.",
  "Retrieve a lost item of importance.",
  "Find a way to communicate with the outside world.",
  "Repair a broken piece of equipment.",
  "Find a hidden cache of supplies.",
  "Escape from a dangerous location.",
  "Provide light in the darkness to help a friend.",
  "Find clean water.",
  "Find edible food.",
  "Discover a weakness in *them*.",
  "Locate another group of survivors.",
  "Comfort someone losing hope.",
  "Create a diversion to save someone.",
  "Share limited resources fairly.",
  "Tend to an injured companion.",
  "Navigate a treacherous path to safety.",
  "Create a temporary safe zone."
];

export const defaultPlayerGMBrinks = [
  "desperately searching for a way out, eyes wide with panic.",
  "clinging to a flickering candle, face illuminated by its dying light.",
  "whispering a prayer, voice trembling with fear.",
  "huddled in a corner, body shaking uncontrollably.",
  "frantically trying to barricade a door, movements clumsy and rushed.",
  "stumbling through the darkness, breath coming in ragged gasps.",
  "clutching a makeshift weapon, knuckles white with tension.",
  "staring into the abyss, expression a mask of terror.",
  "crying out for help, voice hoarse and desperate.",
  "scrambling away from something unseen, eyes darting wildly.",
  "frozen in place, paralyzed by fear.",
  "hyperventilating, struggling to catch breath.",
  "muttering nonsense under breath, eyes unfocused.",
  "scratching symbols into the dirt, seemingly unaware.",
  "trying to hide behind inadequate cover, making themselves small.",
  "attempting a dangerous leap across a dark chasm.",
  "fumbling with matches, trying desperately to start a fire.",
  "sharing the last ration of food, own stomach rumbling.",
  "smashing something valuable in a moment of pure frustration.",
  "arguing intensely over the dwindling map or supplies."
];

export const defaultThreatBrinks = [
  "scuttling across the ceiling, defying gravity.",
  "phasing partially through a solid wall.",
  "rearranging small objects when no one was looking.",
  "whispering names from the shadows just beyond the light.",
  "leaving behind trails of frost on surfaces they touched.",
  "moving without making a sound, even on broken glass.",
  "pointing a long, thin finger towards the cellar door.",
  "dissolving into smoke when the flashlight beam hit them.",
  "digging frantically at the floorboards with unnatural strength.",
  "mimicking my movements perfectly in a darkened window reflection.",
  "pulling something unseen into the vents.",
  "scratching symbols onto the dusty surfaces.",
  "hovering silently just inches off the ground.",
  "turning their head completely around to watch us leave.",
  "extinguishing candles simply by passing near them.",
  "weeping tears that sizzled and steamed on the cold ground.",
  "assembling strange contraptions from debris.",
  "dragging themselves across the floor with only their arms.",
  "communicating through rhythmic tapping on the pipes.",
  "absorbing the light from our lanterns.",
  "standing perfectly still in the corner, just watching.",
  "breathing condensation onto glass, though the air wasn't cold.",
  "leaving footprints that didn't match any known creature.",
  "shedding pieces of themselves that quickly disintegrated.",
  "attempting to lure one of us away with soft calls.",
  "blocking the only known exit.",
  "studying the map we left on the table.",
  "pulling themselves out of the murky water.",
  "twitching erratically under the flickering emergency lights.",
  "seeming to feed on the fear in the room."
];

// Random Name, Look & Concept Generators
export const randomNames = [
  "Aria", "Jasper", "Luna", "Felix", "Nova", "Silas", "Iris", "Orion", "Hazel", "Leo",
  "Willow", "River", "Skye", "Rowan", "Sage", "Asher", "Ivy", "Finn", "Jade", "Kai",
  "Aurora", "Phoenix", "Indigo", "Zephyr", "Opal", "Cyrus", "Lyra", "Rhys", "Wren", "Echo",
  "Remy", "Quinn", "Blair", "Ellis", "Soren", "Kael", "Emerson", "Hollis", "Arden", "Briar",
  "Cove", "Lark", "Sterling", "Marlowe", "Sasha", "Nico", "Jules", "Cassian", "Rory", "Lane",
  "Reese", "Sawyer", "Tatum", "Bellamy", "Darcy", "Flynn", "Greer", "Juno", "Kit", "Vale"
];

export const randomLooks = [
  "Wears tattered clothes and has a haunted look in their eyes.",
  "Has a kind face and gentle eyes, but their hands are calloused and worn.",
  "Always impeccably dressed, even in the most dire circumstances.",
  "Has a wild, untamed appearance, with tangled hair and a fierce gaze.",
  "Small and wiry, with quick, darting movements.",
  "A strong, imposing presence, with broad shoulders and a steady gaze.",
  "Pale and gaunt, with dark circles under their eyes.",
  "Has a warm smile and a comforting presence.",
  "Covered in scars, each one telling a story of survival.",
  "A quiet, observant demeanor, always watching and listening.",
  "Tall and lanky, with a nervous energy.",
  "Has a mischievous glint in their eyes and a quick wit.",
  "Always fidgeting, unable to stay still for long.",
  "Has a calm, serene expression, even in the face of danger.",
  "Covered in tattoos, each one a symbol of their past.",
  "Has a shaved head and a piercing gaze.",
  "Always wearing a hat, pulled low over their eyes.",
  "Has a limp, a reminder of a past injury.",
  "Missing a finger, a testament to a close call.",
  "Has a distinctive birthmark on their face.",
  "Is always wearing a pair of worn leather boots.",
  "Has a collection of trinkets and charms.",
  "Always carrying a worn-out book.",
  "Has a habit of chewing on their lip.",
  "Always humming a tuneless melody.",
  "Has a nervous tic, twitching their eye.",
  "Always adjusting their glasses.",
  "Has a habit of cracking their knuckles.",
  "Always tapping their foot.",
  "Has a habit of tugging at their earlobe."
];

export const randomConcepts = [
  "A former soldier, haunted by their past.",
  "A doctor, struggling to save lives in a dying world.",
  "A teacher, trying to protect their students.",
  "A mechanic, keeping the last vehicles running.",
  "A farmer, trying to grow food in barren lands.",
  "A librarian, preserving knowledge for the future.",
  "A musician, trying to bring joy to the survivors.",
  "An artist, capturing the beauty of a broken world.",
  "A writer, documenting the end of days.",
  "A priest, offering solace to the lost.",
  "A thief, stealing to survive.",
  "A scavenger, searching for anything of value.",
  "A hunter, tracking down food for the group.",
  "A builder, trying to create a safe haven.",
  "A leader, trying to keep everyone together.",
  "A spy, gathering information in the shadows.",
  "A scientist, searching for answers.",
  "A historian, trying to understand the past.",
  "A storyteller, keeping hope alive with tales.",
  "A wanderer, searching for a new home.",
  "A survivor, hardened by the harsh realities.",
  "A protector, guarding the weak.",
  "A healer, mending both body and spirit.",
  "A guide, leading others through the darkness.",
  "A dreamer, clinging to the hope of a better tomorrow.",
  "A rebel, fighting against the encroaching darkness.",
  "A guardian, watching over the last vestiges of civilization.",
  "A prophet, foretelling the future.",
  "A martyr, willing to sacrifice everything.",
  "A trickster, using wit and cunning to survive."
];

// Character Creation Messages
export const newGameMessage = `**The World of Ten Candles**\nYour characters will face unimaginable terrors in the dying of the light.\n\n**Though you know your characters will die, you must have hope that they will survive.**\n\n**Ten Candles** focuses around shared narrative control.\nEveryone will share the mantle of storyteller and have an equal hand in telling this dark story.\n\nLet\'s begin character generation. Check your DMs for instructions.\n\n`;
export const stepOneMessage = `**Step One: Players Write Traits**\nPlayers, check your DMs and reply with a Virtue and a Vice.`;
export const stepTwoMessage = `**Step Two: GM Introduces this session's Module / Theme**\nThe GM will now introduce the module/theme and respond in their DMs with the theme title and description which will automatically advance to Step Three`;
export const stepThreeMessage = `**Step Three: Players Create Concepts**\nPlayers, expect a DM and respond with your character\'s Name, Look and Concept, in that order as three separate messages.`;
export const stepFourMessage = `**Step Four: Players Plan Moments**\nMoments are an event that would be reasonable to achieve, kept succinct and clear to provide strong direction. However, all Moments should have potential for failure.`;
export const stepFiveMessage = `**Step Five: Players and GM Discover Brinks**\nCheck your DMs for personalized instructions on this step.`;
export const stepSixMessage = '**Step Six: Arrange Trait Stacks**\nPlayers should now arrange their Traits, Moment, and Brink cards. Your Brink must go on the bottom of the stack, face down. See your DMs to confirm your stack order.';
export const stepSevenMessage = '**Step Seven: Inventory Supplies**\nYour character has whatever items you have in your pockets (or follow your GM\'s instructions, if provided). See your DMs to input your gear.';
export const stepSevenReminder = '**It begins.**\n\n*For the remainder of the session, you should endeavor to act in-character.*';
export const stepEightMessage = '**Final Recordings**\nPlayers, please check your DMs for instructions on sending your final recording.';
export const gameStartMessage = `**Game Start**\nCharacter generation is complete! Ten candles are lit, and the game begins.\n\n**How to Use \`${BOT_PREFIX}conflict\`:**\nUse the \`${BOT_PREFIX}conflict\` command to perform actions.\nBuring a Virtue or Vice from the top of your stack allows your \`${BOT_PREFIX}conflict\` to reroll all ones.\nBuring your Moment from the top of your stack will give you a valuable Hope die if the \`${BOT_PREFIX}conflict\` succeeds!\n\nCandles will be extinguished as the scenes progress.`;
export const startingMessageGM = `**Ten Candles Game Mechanics**\nResolving a Conflict: Players use \`${BOT_PREFIX}conflict\` to roll the communal dice pool. If at least one die lands on 6 the conflict is successful. Any dice that come up 1 are removed until the scene ends. A candle is darkened if no 6s appear on a conflict roll (after any appropriate Traits are burned).\nBurning Traits: A player may burn a Trait to reroll all dice which come up 1 in a conflict.\nMoment: If a player lives their Moment successfully, they gain a Hope Die to add to their conflict rolls.\nHope Die: A Hope Die succeeds on a 5 or a 6.\nBrink: After all else has burned away, whenever a player embraces their Brink, they reroll all dice. If the conflict roll still fails, they lose their Hope die (if they had one).\nDire Conflicts: You may decide that a particular conflict roll will be dire. The player may either withdraw their action or press onward. If they press onward a success is handled normally, but a failure may result in permanent damage to the character (mental or physical).\nNarration Rights: If the player rolled more 6s than you (the GM), that player may describe what happens as a result of the conflict. Keep the narration simple, reasonable, and interesting. Remember: you aren't playing to win, but to tell a good story. If you (the GM) tied the player's roll or rolled more 6s than the player, you (the GM) may describe what happens as a result of the conflict. A player who fails a conflict roll may take over narration at any time, the cost is their character's life.\nDarkening Candles: Whenever a candle is darkened for any reason, the current scene ends and Changing Scenes events happen before a new scene begins. Once darkened, candles may never be relit. When no lit candles remain, the game enters The Last Stand.\nChanging Scenes: Any time a candle darkens and a new scene begins, three events occur.\nTransition: You (the GM) transition the players out of the failed conflict roll and scene. This should be brief so as not to close off too many player avenues.\nEstablishing Truths:\nThese things are true. The world is dark.\nEstablish # truths equal to lit candles.\nTruths are irrefutable facts pertaining to a single change in the story. (e.g. "Billy began convulsing on the floor and then suddenly stopped"; "Our flashlights illuminated the water, but there were no waves."; or "We filled the pickup's tank by mouth-siphoning gas from cars on the highway").\nAfter the last truth everyone left alive speaks, “and we are alive.”\nDice Pools Refresh: The Players' pool of dice refills to the number of lit candles. The GM's pool equals the number of unlit candles.`;
export const startingMessagePlayer = `**Ten Candles Game Mechanics**\nResolving a Conflict: Use \`${BOT_PREFIX}conflict\` after you have declared the action you'd like to take to roll the communal dice pool. If at least one die lands on 6 the conflict is successful. Any dice that come up 1 are removed until the scene ends. A candle is darkened if no 6s appear on a conflict roll (after any appropriate Traits are burned).\nBurning Traits: A trait can be burned in order to reroll all dice which come up 1 in a conflict.\nMoment: If you live your Moment successfully, gain a Hope Die to add to your conflict rolls.\nHope Die: A Hope Die succeeds on a 5 or a 6.\nBrink: After all else has burned away, whenever you embrace your Brink, reroll all dice. If the conflict roll still fails, you lose your Hope die (if they had one).\nDire Conflicts: The GM may decide that a particular conflict roll will be dire. If they do so, you may either withdraw their action or press onward. If you press onward a success is handled normally, but a failure may result in permanent damage to your character (mental or physical).\nNarration Rights: If you rolled more 6s than the GM, you may describe what happens as a result of the conflict. Keep the narration simple, reasonable, and interesting. Remember: you aren't playing to win, but to tell a good story. If the GM tied your roll or rolled more 6s, the GM may describe what happens as a result of the conflict. If you fail a conflict roll, you may take over narration at any time, but the cost is your character's life.\nDarkening Candles: Whenever a candle is darkened for any reason, the current scene ends and Changing Scenes events happen before a new scene begins. Once darkened, candles may never be relit. When no lit candles remain, the game enters The Last Stand.\nChanging Scenes: Any time a candle darkens and a new scene begins, three events occur.\nTransition: The GM transitions out of the failed conflict roll and scene. This should be brief so as not to close off too many player avenues.\nEstablishing Truths:\nThese things are true. The world is dark.\nEstablish # truths equal to lit candles.\nTruths are irrefutable facts pertaining to a single change in the story. (e.g. "Billy began convulsing on the floor and then suddenly stopped.", "Our flashlights illuminated the water, but there were no waves." or "We filled the pickup's tank by mouth-siphoning gas from cars on the highway".\nAfter the last truth everyone left alive speaks, “and we are alive.”\nDice Pools Refresh: The Players' pool of dice refills to the number of lit candles. The Players' pool of dice refills to the number of lit candles. The GM's pool equals the number of unlit candles.`;
export const finalRecordingsMessage = 'The final scene fades to black. The story is over. Your final recordings will play after a moment of silence.';
