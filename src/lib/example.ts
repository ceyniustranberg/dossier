import type { Dossier } from "./types";

/** Hand-written sample file shown until the user researches something. */
export const EXAMPLE: Dossier = {
  "id": "example",
  "example": true,
  "query": "flying cars",
  "title": "Flying cars",
  "createdAt": 1789776000000,
  "clusters": [
    "History",
    "Technology",
    "Players",
    "Regulation",
    "Economics",
    "Open questions"
  ],
  "tabs": [],
  "cards": [
    {
      "id": "root",
      "t": "summary",
      "title": "Flying cars",
      "angle": "Technology, industry and regulation of personal air vehicles",
      "body": "“Flying car” covers two quite different machines. Roadable aircraft are small planes that fold their wings and drive on roads, an idea as old as aviation. Electric vertical take-off aircraft (eVTOLs) are battery-powered multirotor air taxis that never touch a road, and they are where almost all of the money has gone since the late 2010s.\n\nThe engineering is largely proven at prototype scale. What remains hard is certification, battery energy, infrastructure and a business model that works beyond premium airport shuttles.",
      "takeaways": [
        "Two lineages: roadable aircraft versus eVTOL air taxis",
        "Batteries, not aerodynamics, set the limits on range and payload",
        "Regulators have created new aircraft categories, but certifying each design is slow",
        "A funding shakeout in late 2024 removed several well-known European names"
      ],
      "c": 0,
      "x": 0,
      "y": 0
    },
    {
      "id": "c1",
      "c": 0,
      "t": "timeline",
      "title": "A century of almost",
      "items": [
        {
          "when": "1917",
          "what": "Glenn Curtiss shows the Autoplane in New York. It manages short hops at best."
        },
        {
          "when": "1947",
          "what": "Convair’s Model 118 prototype crash-lands on a test flight after running out of fuel."
        },
        {
          "when": "1956",
          "what": "Molt Taylor’s Aerocar wins US civil certification. Only a handful are built."
        },
        {
          "when": "2022",
          "what": "Klein Vision’s AirCar receives a Slovak certificate of airworthiness."
        },
        {
          "when": "2023",
          "what": "China’s CAAC issues a type certificate for EHang’s pilotless EH216-S."
        }
      ],
      "x": 0,
      "y": 0
    },
    {
      "id": "c2",
      "c": 0,
      "t": "picture",
      "title": "Taylor Aerocar on the road",
      "body": "The 1950s Aerocar towing its folded wings and tail as a trailer is the defining image of the roadable-aircraft idea.",
      "q": "Taylor Aerocar folded wings trailer",
      "x": 0,
      "y": 0
    },
    {
      "id": "c3",
      "c": 1,
      "t": "fact",
      "title": "Many small rotors instead of one big one",
      "body": "eVTOL designs rely on distributed electric propulsion: six to eighteen independently driven propellers. Losing one is survivable, blade tip speeds are lower so the aircraft is quieter than a helicopter, and there is no complex gearbox or swashplate.",
      "x": 0,
      "y": 0
    },
    {
      "id": "c4",
      "c": 1,
      "t": "stat",
      "num": "~250 Wh/kg",
      "title": "Energy in a good lithium-ion cell",
      "body": "Jet fuel holds roughly 12,000 Wh/kg, in the region of 40 to 50 times more per kilogram. This gap is why ranges are short and payloads small.",
      "rel": "c11",
      "x": 0,
      "y": 0
    },
    {
      "id": "c5",
      "c": 1,
      "t": "chart",
      "title": "Claimed range, selected designs",
      "unit": "km",
      "note": "Manufacturer claims, approximate. Real operations carry reserves and fly less.",
      "bars": [
        {
          "label": "Joby S4",
          "value": 160
        },
        {
          "label": "Archer Midnight",
          "value": 160
        },
        {
          "label": "Volocopter VoloCity",
          "value": 35
        },
        {
          "label": "EHang EH216-S",
          "value": 30
        }
      ],
      "x": 0,
      "y": 0
    },
    {
      "id": "c6",
      "c": 2,
      "t": "player",
      "title": "Joby Aviation",
      "role": "eVTOL developer · California",
      "body": "Piloted four-passenger tilt-propeller aircraft. Toyota is a major investor and manufacturing partner; Joby absorbed Uber’s Elevate unit in 2020.",
      "x": 0,
      "y": 0
    },
    {
      "id": "c7",
      "c": 2,
      "t": "player",
      "title": "Archer Aviation",
      "role": "eVTOL developer · California",
      "body": "Builds the Midnight air taxi, designed around back-to-back short hops. Backed by United Airlines and Stellantis.",
      "x": 0,
      "y": 0
    },
    {
      "id": "c8",
      "c": 2,
      "t": "player",
      "title": "EHang",
      "role": "Autonomous eVTOL · Guangzhou",
      "body": "Two-seat, pilotless EH216-S aimed first at sightseeing flights. The first passenger-carrying eVTOL anywhere to gain a type certificate.",
      "rel": "c1",
      "x": 0,
      "y": 0
    },
    {
      "id": "c9",
      "c": 2,
      "t": "player",
      "title": "Klein Vision and Alef",
      "role": "Roadable end of the field",
      "body": "Klein Vision’s AirCar converts from sports car to aeroplane in a few minutes. Alef Aeronautics is pursuing a car-shaped vehicle that lifts vertically and holds a limited US special airworthiness certificate for testing.",
      "x": 0,
      "y": 0
    },
    {
      "id": "c10",
      "c": 3,
      "t": "fact",
      "title": "A new aircraft category in the US",
      "body": "In October 2024 the FAA published its final rule for “powered-lift” pilot training and operations, the first new civil aircraft category it has integrated since helicopters in the 1940s. It sets who may fly these aircraft and under what operating rules, separate from certifying each design.",
      "x": 0,
      "y": 0
    },
    {
      "id": "c11",
      "c": 3,
      "t": "lead",
      "title": "Type certification progress at the FAA and EASA",
      "body": "The milestone to track for every Western developer. Look for which test phase each aircraft is in, and for slips against earlier launch dates.",
      "q": "eVTOL type certification FAA EASA",
      "x": 0,
      "y": 0
    },
    {
      "id": "c12",
      "c": 4,
      "t": "fact",
      "title": "The 2024 shakeout",
      "body": "Germany’s Lilium and Volocopter both filed for insolvency in late 2024 after failing to secure further funding, despite flying prototypes and large order books. Cash needs before first revenue run to billions.",
      "rel": "c14",
      "x": 0,
      "y": 0
    },
    {
      "id": "c13",
      "c": 4,
      "t": "debate",
      "title": "Can air taxis become affordable mass transit?",
      "pro": [
        "Electric drivetrains are cheap to run and maintain",
        "No runway needed, so routes can start city to airport",
        "Autonomy could later remove the pilot cost"
      ],
      "con": [
        "One pilot per four passengers is expensive",
        "Vertiports and grid connections are unbuilt",
        "Battery packs wear quickly under fast-charge cycles",
        "Weather and airspace limits cap utilisation"
      ],
      "x": 0,
      "y": 0
    },
    {
      "id": "c14",
      "c": 5,
      "t": "question",
      "title": "Who pays for the vertiports?",
      "body": "Operators, airports, cities and property developers each expect someone else to fund landing sites and high-power charging.",
      "x": 0,
      "y": 0
    },
    {
      "id": "c15",
      "c": 5,
      "t": "question",
      "title": "Will cities accept low-altitude traffic overhead?",
      "body": "Noise is lower than a helicopter’s, but visual intrusion, privacy and perceived safety are untested at scale.",
      "x": 0,
      "y": 0
    }
  ],
  "brief": "Technology, industry and regulation of personal air vehicles"
};
