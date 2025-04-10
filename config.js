export const CONSENT_TIMEOUT = 60000;
export const TRAIT_TIMEOUT = 60000;
export const SACRIFICE_TIMEOUT = 60000;
export const BRINK_TIMEOUT = 60000;

export const GM_REMINDER_TIMES = [120000, 300000, 600000];
export const BOT_PREFIX = '.';

export const TEST_USER_ID = '583340515869589522';

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

export const defaultMoments = [
  // Original 10
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
  "desperately searching for a way out, their eyes wide with panic.",
  "clinging to a flickering candle, their face illuminated by its dying light.",
  "whispering a prayer, their voice trembling with fear.",
  "huddled in a corner, their body shaking uncontrollably.",
  "frantically trying to barricade a door, their movements clumsy and rushed.",
  "stumbling through the darkness, their breath coming in ragged gasps.",
  "clutching a makeshift weapon, their knuckles white with tension.",
  "staring into the abyss, their expression a mask of terror.",
  "crying out for help, their voice hoarse and desperate.",
  "scrambling away from something unseen, their eyes darting wildly.",
  "frozen in place, paralyzed by fear.",
  "hyperventilating, struggling to catch their breath.",
  "muttering nonsense under their breath, eyes unfocused.",
  "scratching symbols into the dirt, seemingly unaware.",
  "trying to hide behind inadequate cover, making themselves small.",
  "attempting a dangerous leap across a dark chasm.",
  "fumbling with matches, trying desperately to start a fire.",
  "sharing their last ration of food, their own stomach rumbling.",
  "smashing something valuable in a moment of pure frustration.",
  "arguing intensely over the dwindling map or supplies."
];

export const defaultThreatBrinks = [
  "moving just beyond the edge of the light, always out of focus.",
  "leaving behind a trail of unnatural coldness.",
  ", their eyes glowing with an unnatural light.",
  ", their eyes glowing with an unnatural light.",
  "moving too quick to follow, a blur in the periphery.",
  ", their shadows stretching and distorting in impossible ways.",
  "the temperature in the room plummeting whenever they are near.",
  "the sound of their breathing, ragged and wet, just out of earshot.",
  "a feeling of being watched, even when no one is there.",
  "the lights flickering and dimming in their presence.",
  "a low, guttural humming that vibrates through the floor.",
  "their touch leaving behind a residue that feels strangely slick.",
  "the scent of ozone and burnt sugar lingering after they've gone.",
  "their reflections not quite matching their physical form.",
  "and felt a sense of wrongness, like the fabric of reality is fraying around them.",
  "as small objects around the room began to float and drift.",
  ", the static on any electronic device intensifying when they are close.",
  ", their laughter, a high-pitched and chilling sound, echoing from nowhere.",
  "their skin looking pale and stretched, like it's about to tear.",
  " with a faint, metallic tang in the air, like blood but not quite.",
  " as the patterns on the walls seemed to writhe and shift.",
  "as a profound sense of dread washed over me."
];

export const randomNames = [
  "Aria", "Jasper", "Luna", "Felix", "Nova", "Silas", "Iris", "Orion", "Hazel", "Leo",
  "Willow", "River", "Skye", "Rowan", "Sage", "Asher", "Ivy", "Finn", "Jade", "Kai",
  "Aurora", "Phoenix", "Indigo", "Zephyr", "Opal", "Cyrus", "Lyra", "Rhys", "Wren", "Echo",
  "Remy", "Quinn", "Blair", "Ellis", "Soren", "Kael", "Emerson", "Hollis", "Arden", "Briar",
  "Cove", "Lark", "Sterling", "Marlowe", "Sasha", "Nico", "Jules", "Cassian", "Rory", "Lane",
  "Reese", "Sawyer", "Tatum", "Bellamy", "Darcy", "Flynn", "Greer", "Juno", "Kit", "Vale"
];

export const randomLooks = [
  "wears tattered clothes and has a haunted look in their eyes.",
  "has a kind face and gentle eyes, but their hands are calloused and worn.",
  "is always impeccably dressed, even in the most dire circumstances.",
  "has a wild, untamed appearance, with tangled hair and a fierce gaze.",
  "is small and wiry, with quick, darting movements.",
  "has a strong, imposing presence, with broad shoulders and a steady gaze.",
  "is pale and gaunt, with dark circles under their eyes.",
  "has a warm smile and a comforting presence.",
  "is covered in scars, each one telling a story of survival.",
  "has a quiet, observant demeanor, always watching and listening.",
  "is tall and lanky, with a nervous energy.",
  "has a mischievous glint in their eyes and a quick wit.",
  "is always fidgeting, unable to stay still for long.",
  "has a calm, serene expression, even in the face of danger.",
  "is covered in tattoos, each one a symbol of their past.",
  "has a shaved head and a piercing gaze.",
  "is always wearing a hat, pulled low over their eyes.",
  "has a limp, a reminder of a past injury.",
  "is missing a finger, a testament to a close call.",
  "has a distinctive birthmark on their face.",
  "is always wearing a pair of worn leather boots.",
  "has a collection of trinkets and charms.",
  "is always carrying a worn-out book.",
  "has a habit of chewing on their lip.",
  "is always humming a tuneless melody.",
  "has a nervous tic, twitching their eye.",
  "is always adjusting their glasses.",
  "has a habit of cracking their knuckles.",
  "is always tapping their foot.",
  "has a habit of tugging at their earlobe."
];

export const randomConcepts = [
  "a former soldier, haunted by their past.",
  "a doctor, struggling to save lives in a dying world.",
  "a teacher, trying to protect their students.",
  "a mechanic, keeping the last vehicles running.",
  "a farmer, trying to grow food in barren lands.",
  "a librarian, preserving knowledge for the future.",
  "a musician, trying to bring joy to the survivors.",
  "an artist, capturing the beauty of a broken world.",
  "a writer, documenting the end of days.",
  "a priest, offering solace to the lost.",
  "a thief, stealing to survive.",
  "a scavenger, searching for anything of value.",
  "a hunter, tracking down food for the group.",
  "a builder, trying to create a safe haven.",
  "a leader, trying to keep everyone together.",
  "a spy, gathering information in the shadows.",
  "a scientist, searching for answers.",
  "a historian, trying to understand the past.",
  "a storyteller, keeping hope alive with tales.",
  "a wanderer, searching for a new home.",
  "a survivor, hardened by the harsh realities.",
  "a protector, guarding the weak.",
  "a healer, mending both body and spirit.",
  "a guide, leading others through the darkness.",
  "a dreamer, clinging to the hope of a better tomorrow.",
  "a rebel, fighting against the encroaching darkness.",
  "a guardian, watching over the last vestiges of civilization.",
  "a prophet, foretelling the future.",
  "a martyr, willing to sacrifice everything.",
  "a trickster, using wit and cunning to survive."
];

export const newGameMessage = `**The World of Ten Candles**\nYour characters will face unimaginable terrors in the dying of the light.\n\n**Though you know your characters will die, you must have hope that they will survive.**\n\n**Ten Candles** focuses around shared narrative control.\nEveryone will share the mantle of storyteller and have an equal hand in telling this dark story.\n\nLet\'s begin character generation. Check your DMs for instructions.\n\n`;

export const stepOneMessage = `**Step One: Players Write Traits**\nPlayers, check your DMs and reply with a Virtue and a Vice.`;

export const stepTwoMessage = `**Step Two: GM Introduces this session's Module / Theme**\nThe GM will now introduce the module/theme and then use \`${BOT_PREFIX}theme [description]\` to advance to Step Three`;

export const stepThreeMessage = `**Step Three: Players Create Concepts**\nPlayers, expect a DM and respond with your character\'s Name, Look and Concept, in that order as three separate messages.`;

export const stepFourMessage = `**Step Four: Players Plan Moments**\nMoments are an event that would be reasonable to achieve, kept succinct and clear to provide strong direction. However, all Moments should have potential for failure.`;

export const stepFiveMessage = `**Step Five: Players and GM Discover Brinks**\nCheck your DMs for personalized instructions on this step.`;

export const stepSixMessage = '**Step Six: Arrange Trait Stacks**\nPlayers should now arrange their Traits, Moment, and Brink cards. Your Brink must go on the bottom of the stack, face down. See your DMs to confirm your stack order.';

export const stepSevenMessage = '**Step Seven: Inventory Supplies**\nYour character has whatever items you have in your pockets (or follow your GM\'s instructions, if provided). See your DMs to input your gear.';

export const stepSevenReminder = '**It begins.**\n\n*For the remainder of the session, you should endeavor to act in-character.*';

export const stepEightMessage = '**Final Recordings**\nPlayers, please check your DMs for instructions on sending your final recordings.';

export const gameStartMessage = `**Game Start**\nCharacter generation is complete! Ten candles are lit, and the game begins.\n\n**How to Use \`${BOT_PREFIX}conflict\`:**\nUse the \`${BOT_PREFIX}conflict\` command to perform actions. Use modifiers such as \`-burnvirtue\`, \`-burnvice\` and \`-burnmoment\` as needed.\nBuring a Virtue or Vice from the top of your stack allows your \`${BOT_PREFIX}conflict\` to reroll all ones.\nBuring your Moment from the top of your stack will give you a valuable Hope die if the \`${BOT_PREFIX}conflict\` succeeds!\nExample(s): \`${BOT_PREFIX}conflict\` or \`${BOT_PREFIX}conflict -burnvice\`\n\nCandles will be extinguished as the scenes progress.`;

export const startingMessageGM = `**Ten Candles Game Mechanics**\nResolving a Conflict: Players use \`${BOT_PREFIX}conflict\` to roll a communal dice pool. If at least one die lands on 6 the conflict is successful. Any dice that come up 1 are removed until the scene ends. A candle is darkened if no 6s appear on a conflict roll (after any appropriate Traits are burned).\nBurning Traits: A player may burn a Trait to reroll all dice which come up 1 in a conflict.\nMoment: If a player lives their Moment successfully, they gain a Hope Die to add to their conflict rolls.\nHope Die: A Hope Die succeeds on a 5 or a 6.\nBrink: After all else has burned away, whenever a player embraces their Brink, they reroll all dice. If the conflict roll still fails, they lose their Hope die (if they had one).\nDire Conflicts: You may decide that a particular conflict roll will be dire. The player may either withdraw their action or press onward. If they press onward a success is handled normally, but a failure may result in permanent damage to the character (mental or physical).\nNarration Rights: If the player rolled more 6s than you (the GM), that player may describe what happens as a result of the conflict. Keep the narration simple, reasonable, and interesting. Remember: you aren't playing to win, but to tell a good story. If you (the GM) tied the player's roll or rolled more 6s than the player, you (the GM) may describe what happens as a result of the conflict. A player who fails a conflict roll may take over narration at any time, the cost is their character's life.\nDarkening Candles: Whenever a candle is darkened for any reason, the current scene ends and Changing Scenes events happen before a new scene begins. Once darkened, candles may never be relit. When no lit candles remain, the game enters The Last Stand.\nChanging Scenes: Any time a candle darkens and a new scene begins, three events occur.\nTransition: You (the GM) transition the players out of the failed conflict roll and scene. This should be brief so as not to close off too many player avenues.\nEstablishing Truths:\nThese things are true. The world is dark.\nEstablish # truths equal to lit candles.\nTruths are irrefutable facts pertaining to a single change in the story. (e.g. "Billy began convulsing on the floor and then suddenly stopped"; "Our flashlights illuminated the water, but there were no waves."; or "We filled the pickup's tank by mouth-siphoning gas from cars on the highway").\nAfter the last truth everyone left alive speaks, “and we are alive.”\nDice Pools Refresh: The Players' pool of dice refills to the number of lit candles. The GM's pool equals the number of unlit candles.`;

export const startingMessagePlayer = `**Ten Candles Game Mechanics**\nResolving a Conflict: Use \`${BOT_PREFIX}conflict\` after you have declared the action you'd like to take to roll the communal dice pool. If at least one die lands on 6 the conflict is successful. Any dice that come up 1 are removed until the scene ends. A candle is darkened if no 6s appear on a conflict roll (after any appropriate Traits are burned).\nBurning Traits: A trait can be burned in order to reroll all dice which come up 1 in a conflict.\nMoment: If you live your Moment successfully, gain a Hope Die to add to your conflict rolls.\nHope Die: A Hope Die succeeds on a 5 or a 6.\nBrink: After all else has burned away, whenever you embrace your Brink, reroll all dice. If the conflict roll still fails, you lose your Hope die (if they had one).\nDire Conflicts: The GM may decide that a particular conflict roll will be dire. If they do so, you may either withdraw their action or press onward. If you press onward a success is handled normally, but a failure may result in permanent damage to your character (mental or physical).\nNarration Rights: If you rolled more 6s than the GM, you may describe what happens as a result of the conflict. Keep the narration simple, reasonable, and interesting. Remember: you aren't playing to win, but to tell a good story. If the GM tied your roll or rolled more 6s, the GM may describe what happens as a result of the conflict. If you fail a conflict roll, you may take over narration at any time, but the cost is your character's life.\nDarkening Candles: Whenever a candle is darkened for any reason, the current scene ends and Changing Scenes events happen before a new scene begins. Once darkened, candles may never be relit. When no lit candles remain, the game enters The Last Stand.\nChanging Scenes: Any time a candle darkens and a new scene begins, three events occur.\nTransition: The GM transitions out of the failed conflict roll and scene. This should be brief so as not to close off too many player avenues.\nEstablishing Truths:\nThese things are true. The world is dark.\nEstablish # truths equal to lit candles.\nTruths are irrefutable facts pertaining to a single change in the story. (e.g. "Billy began convulsing on the floor and then suddenly stopped.", "Our flashlights illuminated the water, but there were no waves." or "We filled the pickup's tank by mouth-siphoning gas from cars on the highway".\nAfter the last truth everyone left alive speaks, “and we are alive.”\nDice Pools Refresh: The Players' pool of dice refills to the number of lit candles. The Players' pool of dice refills to the number of lit candles. The GM's pool equals the number of unlit candles.`;

export const finalRecordingsMessage = 'The final scene fades to black. The story is over. Your final recordings will play after a moment of silence.';
