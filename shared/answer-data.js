export const CATEGORY_KEYS = ['name', 'place', 'animal', 'thing'];

// A practical starter dictionary, intentionally including common Indian names and places.
// Keep entries lowercase and normalized; this is a fallback, not an exhaustive dictionary.
export const ANSWER_WORDS = {
  name: `aarav aarya aadhya aanya abhi abhay aditi aditya ajay akash akhil akshara akshay alok aman amara amit amrita ananya anil anjali ananya anusha anushka anirudh ananya arjun arnav arun arya ashish asha ashok avinash bhanu bharat bhavana bhavya chaitanya charan chetan deepa deepak deepika dev dhruv diya divya gautam geetha gita gopal harini hari harsha hema indira ishita jagan jai janaki jasmin jay jhansi jiya kalyan kalyani karthik kavya keerthi keerthana kiran kishore krishna kalyan keerthana lokesh lakshmi lavanya madhav madhavi mahesh manoj manasa megha meera mihir mohan mounika mouni nitya nagesh nakul nandini naveen navya neha nikhil nikita nisha nithin noah pavan pavani pooja prasad praneeth praneeta praveen priya rahul raj raja rakesh ram rama ravi rekha rohan rohit rose sai sakshi sanjay sandeep sanjana sarah satya shiva shreya siddharth sneha srinivas sriram sushma swathi sravani santhosh sindhu suresh tarun teja uma vasavi venkat venkatesh varun ved vikas vijay vikram vishal yash lily jasmine vineela`.split(' '),
  place: `agra ahmedabad amaravati amritsar anakapalle andhra araku australia aurangabad bangalore bengaluru bhilai bhopal bhubaneswar canada chennai chicago coimbatore delhi dubai egypt france goa guntur guntur hyderabad india indore eluru kakinada kurnool kadapa ongole anantapur ananthapur machilipatnam bhimavaram tanuku tenali gudivada srikakulam vijayanagaram nizamabad karimnagar khammam secunderabad jakarta jaipur jammu jamnagar japan jhansi jodhpur kanpur kashmir kerala kolkata london lucknow madurai maldives manali melbourne mumbai mysore nagpur nellore newyork ooty paris patna pune qatar rajahmundry rajasthan rome singapore surat tirupati tokyo tirunelveli vietnam vijayawada vizag warangal washington`.split(' '),
  animal: `aardvark alligator alpaca ant anteater antelope ape badger bat bear beaver bee beetle bison boar buffalo butterfly camel capybara caracal cat caterpillar cheetah chicken chimpanzee chinchilla cobra cockroach cod cougar cow coyote crab crane crocodile crow deer dingo dog dolphin donkey dove dragonfly duck eagle eel elephant emu falcon ferret finch firefly flamingo fly fox frog gazelle gecko gerbil giraffe goat goose gorilla grasshopper hamster hare hawk hedgehog heron hippopotamus hornet horse hummingbird hyena ibex iguana impala jackal jaguar jay jellyfish kangaroo kingfisher kiwi koala komodo leopard lion lizard llama lobster locust loon lynx macaw magpie manatee mandrill meerkat mink mole mongoose monkey moose mosquito moth mouse mule narwhal newt nightingale octopus opossum orangutan orca oryx ostrich otter owl ox oyster panda panther parakeet parrot peacock pelican penguin pheasant pig pigeon piranha platypus porcupine porpoise possum prairie dog puffin puma quail quokka quetzal rabbit raccoon rat rattlesnake raven reindeer rhinoceros robin salamander salmon sardine scorpion seahorse seal shark sheep shrew skunk sloth snail snake sparrow spider squid squirrel starfish stingray stork swan tapir tarantula termite tiger toad tortoise toucan trout tuna turkey turtle viper vole vulture wallaby walrus wasp weasel whale wildcat wolf wombat woodpecker worm yak zebra`.split(' '),
  thing: `accordion adapter airplane album alarm ambulance anchor android angle anklet antenna apple apron arch arrow ashtray atlas backpack badge bag ball balloon banana bandage bank basket bat bathrobe battery bead bean bear bell belt bench bicycle binoculars blanket blender block board boat book bookmark bottle bowl box bracelet bread brick broom brush bucket button calendar camera can candle candleholder cap car card carpet cart case cassette castle chain chair chalk charger chessboard chisel chocolate clock cloth clothes hanger clutch comb compass computer cone cooker cork couch counter crayon cup curtain cushion dart dashboard desk diamond diary dice dictionary dish doghouse doll domino door doormat drawer dress drill drum dryer dustbin earphone earbuds easel eggbeater envelope eraser fan faucet feather fence file film filter fingernail flag flashlight flask flute folder fork frame freezer fridge funnel game garland gauge gem generator glass glove glue goggles gong grill guitar gunnybag hammer handbag hanger harmonica harp hat headphone helmet hook hose hourglass house icebox ink instrument iron jacket jar jeans jewel joystick jug kettle key keyboard kite knife ladder lamp lantern laptop latch leaf leash ledger lens letter light lighter lighterbox lipstick lock locker locket lunchbox machine magnet mailbox map marker match mattress medal megaphone microphone microscope mirror mixer mobile monitor mop motorcycle mountain mouse mug nail napkin needle necklace notebook nozzle nut oar ocarina oven pad paddle paint palette pan paper paperclip parachute parcel pen pencil pendant phone photo piano picture pillow pin pipe pitcher plane plant plate plug pliers plow pocketbook postcard pot potato printer projector purse puzzle quill quilt quiver racket radio rail ruler razor receipt remote ribbon ring robot rock roller roof rope router ruler sail sandwich saucepan scale scarf scissors scooter screen screwdriver sculpture seal seat sewing machine shaker shelf shell shirt shoe shovel shower sideboard sieve sign sink skateboard skirt sled slipper smartphone soap socket sofa software speaker spoon stamp stapler star statue steering wheel stove straw string suitcase switch table tablet tag tank tape teapot telescope television thermometer thread ticket tie tile timer toaster toilet tollbooth tool toothbrush toothpaste torch towel toy tractor train tray tree tricycle tripod trophy truck trumpet tub tube tuner umbrella uniform van vase vegetable wallet watch water bottle watering can weapon webcam wheel whistle whiteboard window wire wrench yoyo zip zipper`.split(' ')
};

export function normalizeAnswer(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US').replace(/[’‘]/g, "'").replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');
}

export function levenshtein(a, b) {
  const left = normalizeAnswer(a);
  const right = normalizeAnswer(b);
  const previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[right.length];
}

export function suggestSpelling(answer, category, letter = '') {
  const cleaned = normalizeAnswer(answer).replace(/[^a-z ]/g, '').trim();
  if (cleaned.length < 3 || ANSWER_WORDS[category]?.includes(cleaned)) return '';
  const first = String(letter || cleaned[0]).toLocaleLowerCase('en-US');
  const maxDistance = cleaned.length >= 7 ? 2 : 1;
  let best = '';
  let bestDistance = maxDistance + 1;
  for (const candidate of ANSWER_WORDS[category] || []) {
    if (candidate[0] !== first || Math.abs(candidate.length - cleaned.length) > maxDistance) continue;
    const distance = levenshtein(cleaned, candidate);
    if (distance > 0 && distance <= maxDistance && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      if (distance === 1) break;
    }
  }
  return best ? best[0].toUpperCase() + best.slice(1) : '';
}

export function validateLocally(answer, category, letter) {
  const normalized = normalizeAnswer(answer);
  if (!normalized) return { status: 'empty', reason: 'No answer entered.', suggestion: '', source: 'local' };
  const startsCorrectly = normalized[0]?.toLocaleUpperCase('en-US') === String(letter || '').toLocaleUpperCase('en-US');
  if (!startsCorrectly) return { status: 'invalid', reason: `Start your answer with ${letter}.`, suggestion: '', source: 'local' };

  const words = ANSWER_WORDS[category] || [];
  if (words.includes(normalized)) return { status: 'valid', reason: 'Recognised answer for this category.', suggestion: '', source: 'dictionary' };

  const suggestion = suggestSpelling(normalized, category, letter);
  if (suggestion) return { status: 'review', reason: `Possible spelling mistake. Did you mean “${suggestion}”?`, suggestion, source: 'spellcheck' };

  const knownElsewhere = Object.entries(ANSWER_WORDS).find(([otherCategory, entries]) => otherCategory !== category && entries.includes(normalized));
  if (category === 'name') {
    // Don't pretend to know every regional name. Unknown names and possible nicknames
    // remain reviewable instead of silently scoring as valid or being falsely rejected.
    if (knownElsewhere) return { status: 'review', reason: `“${String(answer).trim()}” is usually listed as a ${knownElsewhere[0]}, but it could be a personal name or nickname. Ask the room to review it.`, suggestion: '', source: 'name-review' };
    if (/^[a-z][a-z .'-]{1,38}$/i.test(String(answer).trim())) return { status: 'review', reason: 'This name is not in the local list. AI can check it if enabled, or the room can review it.', suggestion: '', source: 'name-review' };
  }

  if (knownElsewhere) {
    return { status: 'invalid', reason: `This is recognised as a ${knownElsewhere[0]}, not a ${category}.`, suggestion: '', source: 'dictionary' };
  }

  // Place names are often local/regional; obvious place types are accepted without an external lookup.
  if (category === 'place' && /^[a-z][a-z .'-]{1,50}$/i.test(String(answer).trim()) && /\b(city|town|village|river|mount|lake|street|park|state|country|beach|island|district|fort|temple|dam|valley|hill|airport)\b/i.test(String(answer))) {
    return { status: 'valid', reason: 'Recognised place-type wording.', suggestion: '', source: 'local-rule' };
  }

  return { status: 'review', reason: 'Not in the local list. It can be checked by AI if enabled or reviewed by the room.', suggestion: '', source: 'local-review' };
}
