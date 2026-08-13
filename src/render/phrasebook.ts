import type { NationId } from "../data/nations.ts";

/**
 * The phrasebook.
 *
 * A playtest of one island heard two and a half thousand lines and only
 * thirty-nine different ones, with a single sentence coming round two hundred
 * times — and five in six of them were a complaint, because the only things
 * anybody had been given to say were that they were hungry, thirsty or wretched.
 * That is a refugee camp with a Jolly Roger over it.
 *
 * A buccaneer haven in 1650 is not a medieval one and not a miserable one. It
 * has men who boast, sing, swear, gamble, argue about who owes whom a share,
 * mistrust Fridays and green sails, and talk about the sea. So this is a great
 * deal longer than it needs to be, and every line is written in its own language
 * rather than translated into it: `Je meurs de faim` and `Me muero de hambre`
 * are what those people say, not what an Englishman's sentence looks like after
 * a dictionary has been at it.
 *
 * Kept apart from the logic next door because it is data and it will keep
 * growing.
 */

export type Topic =
  | "greeting"
  | "hungry"
  | "thirsty"
  | "working"
  | "hauling"
  | "brawling"
  | "fleeing"
  | "miserable"
  | "content"
  | "boasting"
  | "sea"
  | "superstition"
  | "song"
  | "gold"
  | "gambling"
  | "wenching";

export type Lines = Record<NationId, readonly string[]>;

/** What a pirate says, which is most of the colour on the island. */
export const PIRATE_LINES: Record<Topic, Lines> = {
  greeting: {
    england: [
      "Ahoy!",
      "Well met.",
      "What cheer?",
      "Ho there!",
      "Still breathing, then.",
      "You owe me a drink.",
    ],
    france: [
      "Ohé !",
      "Salut, frère.",
      "Alors ?",
      "Bien le bonjour.",
      "Toujours vivant ?",
      "Tu me dois un verre.",
    ],
    spain: ["¡Ahoy!", "¿Qué tal?", "¡Hermano!", "Buenas.", "¿Sigues vivo?", "Me debes un trago."],
  },
  hungry: {
    england: [
      "My belly's empty.",
      "Not a crumb.",
      "I could eat a rope.",
      "Salt pork, and not much of it.",
      "I've eaten worse. Not lately.",
    ],
    france: [
      "J'ai le ventre vide.",
      "Rien à manger.",
      "Je mangerais un cordage.",
      "Du lard salé, et pas beaucoup.",
      "J'ai connu pire. Pas récemment.",
    ],
    spain: [
      "Tengo hambre.",
      "Ni una miga.",
      "Me comería un cabo.",
      "Cerdo salado, y poco.",
      "He comido peor. No últimamente.",
    ],
  },
  thirsty: {
    england: [
      "Where's the rum?",
      "A drink, damn it.",
      "Dry as a bone.",
      "My throat's full of salt.",
      "Water? I'm no fish.",
    ],
    france: [
      "Où est le rhum ?",
      "À boire !",
      "J'ai la gorge sèche.",
      "J'ai la bouche pleine de sel.",
      "De l'eau ? Je ne suis pas un poisson.",
    ],
    spain: [
      "¿Dónde está el ron?",
      "¡Una copa!",
      "Seco como el polvo.",
      "Tengo la garganta llena de sal.",
      "¿Agua? No soy un pez.",
    ],
  },
  working: {
    england: [
      "Back to it.",
      "Heave!",
      "Long day.",
      "This is not what I signed for.",
      "Pirates don't dig.",
    ],
    france: [
      "Au travail.",
      "Ho ! Hisse !",
      "Longue journée.",
      "Ce n'est pas pour ça que j'ai signé.",
      "Un pirate, ça ne creuse pas.",
    ],
    spain: [
      "A trabajar.",
      "¡Vamos!",
      "Qué día tan largo.",
      "No firmé para esto.",
      "Un pirata no cava.",
    ],
  },
  hauling: {
    england: ["Mind your backs!", "Heavy, this.", "Coming through.", "Give us a hand, then."],
    france: ["Attention !", "C'est lourd.", "Laissez passer.", "Donne-moi un coup de main."],
    spain: ["¡Cuidado!", "Pesa mucho.", "¡Paso!", "Échame una mano."],
  },
  brawling: {
    england: [
      "Say that again!",
      "Come on then!",
      "I'll have you!",
      "That was my share!",
      "Draw, you dog!",
    ],
    france: [
      "Répète un peu !",
      "Viens donc !",
      "Je vais te crever !",
      "C'était ma part !",
      "Dégaine, chien !",
    ],
    spain: ["¡Repítelo!", "¡Ven aquí!", "¡Te mato!", "¡Esa era mi parte!", "¡Desenvaina, perro!"],
  },
  fleeing: {
    england: ["Run for it!", "To the water!", "I'm away!", "They'll not take me!"],
    france: ["Fuyons !", "À l'eau !", "Je m'en vais !", "Ils ne m'auront pas !"],
    spain: ["¡Corre!", "¡Al agua!", "¡Me largo!", "¡No me cogerán!"],
  },
  miserable: {
    england: [
      "This is no life.",
      "Cursed island.",
      "I've had enough.",
      "I should have stayed ashore.",
      "There's better crews.",
    ],
    france: [
      "Ce n'est pas une vie.",
      "Île maudite.",
      "J'en ai assez.",
      "J'aurais dû rester à terre.",
      "Il y a de meilleurs équipages.",
    ],
    spain: [
      "Esto no es vida.",
      "Isla maldita.",
      "Ya basta.",
      "Debí quedarme en tierra.",
      "Hay mejores tripulaciones.",
    ],
  },
  content: {
    england: [
      "Fine day for it.",
      "Not so bad.",
      "A good haul.",
      "Warm sand, full belly.",
      "I've no complaints today.",
    ],
    france: [
      "Belle journée.",
      "Ça peut aller.",
      "Belle prise.",
      "Sable chaud, ventre plein.",
      "Aucune plainte aujourd'hui.",
    ],
    spain: [
      "Buen día.",
      "No está mal.",
      "Buen botín.",
      "Arena caliente, panza llena.",
      "Hoy no me quejo.",
    ],
  },
  boasting: {
    england: [
      "I boarded her first.",
      "Two ships, one glass of sand.",
      "The Dons still speak my name.",
      "I've never run from a sail.",
      "Ask anyone in Port Royal.",
    ],
    france: [
      "Je suis monté à bord le premier.",
      "Deux navires en un tour de sablier.",
      "Les Espagnols disent encore mon nom.",
      "Je n'ai jamais fui une voile.",
      "Demande à n'importe qui à Tortuga.",
    ],
    spain: [
      "Yo abordé primero.",
      "Dos barcos en un reloj de arena.",
      "Todavía dicen mi nombre en La Habana.",
      "Nunca huí de una vela.",
      "Pregunta a cualquiera en Maracaibo.",
    ],
  },
  sea: {
    england: [
      "Wind's backing round.",
      "There's weather coming.",
      "Flat calm. I hate it.",
      "A sail, southward.",
      "Good water under her.",
    ],
    france: [
      "Le vent tourne.",
      "Il y a du gros temps qui vient.",
      "Calme plat. Je déteste ça.",
      "Une voile, au sud.",
      "Elle a bon fond sous elle.",
    ],
    spain: [
      "El viento está rolando.",
      "Viene mal tiempo.",
      "Calma chicha. La odio.",
      "Una vela, al sur.",
      "Buen fondo bajo ella.",
    ],
  },
  superstition: {
    england: [
      "Don't sail on a Friday.",
      "Whistling brings a gale.",
      "I saw a green sail. Bad.",
      "Never say the word 'drowned'.",
      "There's a curse on this bay.",
    ],
    france: [
      "On n'appareille pas un vendredi.",
      "Siffler, ça amène le vent.",
      "J'ai vu une voile verte. Mauvais.",
      "Ne dis jamais le mot « noyé ».",
      "Cette baie est maudite.",
    ],
    spain: [
      "No se zarpa en viernes.",
      "Silbar trae temporal.",
      "Vi una vela verde. Mal agüero.",
      "Nunca digas la palabra «ahogado».",
      "Esta bahía está maldita.",
    ],
  },
  song: {
    england: [
      "...and the gold went down with her!",
      "...fifteen on a dead man's chest...",
      "...she was bound for Porto Bello...",
      "...heave away, heave away...",
    ],
    france: [
      "...et l'or a coulé avec elle !",
      "...quinze sur le coffre du mort...",
      "...elle faisait route sur Porto Bello...",
      "...tire, oh ! tire, oh !...",
    ],
    spain: [
      "...¡y el oro se hundió con ella!",
      "...quince sobre el cofre del muerto...",
      "...iba rumbo a Portobelo...",
      "...¡iza, iza!...",
    ],
  },
  gold: {
    england: [
      "My share was short.",
      "Buried mine. Somewhere.",
      "Eight reales, near enough.",
      "Gold's no good in a grave.",
      "Spend it before you're hanged.",
    ],
    france: [
      "Ma part était courte.",
      "J'ai enterré la mienne. Quelque part.",
      "Huit réaux, à peu près.",
      "L'or ne sert à rien dans une tombe.",
      "Dépense-le avant d'être pendu.",
    ],
    spain: [
      "Mi parte salió corta.",
      "Enterré la mía. En algún sitio.",
      "Ocho reales, más o menos.",
      "El oro no sirve en la tumba.",
      "Gástalo antes de que te cuelguen.",
    ],
  },
  gambling: {
    england: [
      "Dice, and be quick.",
      "Double or nothing.",
      "You cheated, and I saw.",
      "That's my last coin.",
    ],
    france: [
      "Les dés, et vite.",
      "Quitte ou double.",
      "Tu as triché, je l'ai vu.",
      "C'est ma dernière pièce.",
    ],
    spain: [
      "Los dados, y rápido.",
      "Doble o nada.",
      "Hiciste trampa, lo vi.",
      "Es mi última moneda.",
    ],
  },
  wenching: {
    england: [
      "She'll not remember me.",
      "I'm in love again.",
      "Save me a seat.",
      "Cleaner than the last port.",
    ],
    france: [
      "Elle ne se souviendra pas de moi.",
      "Je suis encore amoureux.",
      "Garde-moi une place.",
      "Plus propre que le dernier port.",
    ],
    spain: [
      "No se acordará de mí.",
      "Me he enamorado otra vez.",
      "Guárdame sitio.",
      "Más limpio que el último puerto.",
    ],
  },
};

/**
 * What a captive says, which is a different tone entirely.
 *
 * Where a topic is missing they fall back to the pirates' words, because hunger
 * sounds much the same in any mouth.
 */
export const CAPTIVE_LINES: Partial<Record<Topic, Lines>> = {
  greeting: {
    england: [
      "Keep your head down.",
      "Say nothing.",
      "Careful.",
      "Don't look at him.",
      "Are you new?",
    ],
    france: [
      "Baisse la tête.",
      "Ne dis rien.",
      "Fais attention.",
      "Ne le regarde pas.",
      "Tu es nouveau ?",
    ],
    spain: ["Agacha la cabeza.", "No digas nada.", "Ten cuidado.", "No lo mires.", "¿Eres nuevo?"],
  },
  miserable: {
    england: [
      "When do we eat?",
      "How long?",
      "I want to go home.",
      "My family thinks I drowned.",
      "There was a ransom. Nobody paid it.",
      "I was a cooper in Bristol.",
    ],
    france: [
      "On mange quand ?",
      "Combien de temps ?",
      "Je veux rentrer.",
      "Ma famille me croit noyé.",
      "Il y avait une rançon. Personne n'a payé.",
      "J'étais tonnelier à Nantes.",
    ],
    spain: [
      "¿Cuándo comemos?",
      "¿Cuánto más?",
      "Quiero volver a casa.",
      "Mi familia me cree ahogado.",
      "Había un rescate. Nadie lo pagó.",
      "Yo era tonelero en Cádiz.",
    ],
  },
  working: {
    england: [
      "Keep working.",
      "Don't stop.",
      "He's watching.",
      "Slower, and he won't notice.",
      "My hands are ruined.",
    ],
    france: [
      "Continue.",
      "Ne t'arrête pas.",
      "Il nous regarde.",
      "Plus lentement, il ne verra rien.",
      "J'ai les mains foutues.",
    ],
    spain: [
      "Sigue.",
      "No pares.",
      "Nos vigila.",
      "Más despacio, no se dará cuenta.",
      "Tengo las manos destrozadas.",
    ],
  },
  content: {
    england: ["A quiet day, for once.", "Nobody was beaten today.", "The priest was kind."],
    france: [
      "Une journée calme, pour une fois.",
      "Personne n'a été battu aujourd'hui.",
      "Le prêtre a été bon.",
    ],
    spain: ["Un día tranquilo, por una vez.", "Hoy no pegaron a nadie.", "El cura fue amable."],
  },
  fleeing: {
    england: ["The boat! Now!", "Don't look back.", "I'd rather drown."],
    france: ["La barque ! Vite !", "Ne te retourne pas.", "Je préfère me noyer."],
    spain: ["¡La barca! ¡Ya!", "No mires atrás.", "Prefiero ahogarme."],
  },
  superstition: {
    england: ["God has forgotten this island.", "I pray it's a short life.", "The dead walk here."],
    france: [
      "Dieu a oublié cette île.",
      "Je prie pour que ce soit court.",
      "Les morts marchent ici.",
    ],
    spain: ["Dios ha olvidado esta isla.", "Rezo por que sea corta.", "Aquí caminan los muertos."],
  },
};
