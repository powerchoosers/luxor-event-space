CREATE TABLE IF NOT EXISTS public.luxor_site_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  page_name TEXT UNIQUE NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.luxor_site_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access for luxor_site_content"
  ON public.luxor_site_content
  FOR SELECT
  TO PUBLIC
  USING (true);

-- Insert default home page content
INSERT INTO public.luxor_site_content (page_name, content)
VALUES (
  'home',
  '{
    "eventCards": [
      {
        "title": "Weddings",
        "copy": "A polished room for ceremony moments, dinner, portraits, and dancing.",
        "imageSrc": "/images/dining-hall/main-hall-wedding-dance-candid.png",
        "details": ["Ceremony flow", "Reception layout", "Photo moments"]
      },
      {
        "title": "Quinceañeras",
        "copy": "A dramatic setting for the grand entrance, court seating, cake, and family photos.",
        "imageSrc": "/images/dining-hall/main-hall-quinceanera-angle.png",
        "details": ["Grand entrance", "Court seating", "Family photos"]
      },
      {
        "title": "Private celebrations",
        "copy": "Warm enough for showers and birthdays, refined enough for milestone dinners.",
        "imageSrc": "/images/luxor-lounge/luxor-lounge-baby-shower.png",
        "details": ["Baby showers", "Birthdays", "Anniversaries"]
      },
      {
        "title": "Corporate events",
        "copy": "A formal backdrop for awards, dinners, networking, and company gatherings.",
        "imageSrc": "/images/luxor-lounge/luxor-lounge-corporate.png",
        "details": ["Awards", "Networking", "Dinner service"]
      }
    ],
    "planningSteps": [
      ["Tour the room", "Walk the space and picture your guest flow."],
      ["Shape the layout", "Talk through seating, photos, timing, and style."],
      ["Celebrate", "Arrive to a room prepared for your event."]
    ],
    "tourPrepPoints": [
      ["Rough guest count", "Knowing an estimate helps picture the room layout and flow."],
      ["Event type", "Helps plan the main moments, like entrances, cake cutting, or speeches."],
      ["Target dates", "Brings clarity to availability and scheduling."]
    ],
    "tourPrepCards": [
      { "title": "Review pricing & packages", "href": "/pricing", "label": "See details" },
      { "title": "Browse gallery", "href": "/gallery", "label": "View gallery" },
      { "title": "Spaces & capacity", "href": "/spaces", "label": "Explore spaces" }
    ],
    "faqs": [
      ["How many guests can Luxor accommodate?", "Capacity depends on your layout needs, including tables, dance floor, and head table size. Reach out with your estimated guest count so we can advise on a comfortable fit."],
      ["What is included in a booking?", "Our packages typically include tables, chairs, basic linens, and access to the main hall and lounge area. Additional decor and services are available."],
      ["Can I bring outside vendors?", "Yes, you can bring outside vendors such as caterers, DJs, and decorators. We do require vendors to be licensed and insured."],
      ["How do I secure my date?", "A signed agreement and a deposit are required to officially lock in your date on our calendar."],
      ["Is parking available for guests?", "Yes, there is on-site parking available for guests attending events at Luxor."]
    ]
  }'::jsonb
) ON CONFLICT (page_name) DO NOTHING;

-- Insert default events page content
INSERT INTO public.luxor_site_content (page_name, content)
VALUES (
  'events',
  '{
    "eventTypes": [
      {
        "title": "Weddings",
        "copy": "A polished room for ceremony moments, dinner, portraits, speeches, and dancing.",
        "image": "/images/dining-hall/main-hall-wedding-dance-candid.png",
        "iconName": "Heart",
        "points": ["Ceremony and reception flow", "Photo-ready room details", "Dinner and dance floor planning"]
      },
      {
        "title": "Quinceañeras",
        "copy": "A dramatic setting for a grand entrance, court seating, cake, family photos, and dancing.",
        "image": "/images/dining-hall/main-hall-quinceanera-angle.png",
        "iconName": "Cake",
        "points": ["Grand entrance planning", "Court and family seating", "Feature moments for photos"]
      },
      {
        "title": "Baby showers",
        "copy": "A warm, elegant backdrop for lunch, gifts, photos, and a room that feels finished.",
        "image": "/images/luxor-lounge/luxor-lounge-baby-shower.png",
        "iconName": "Baby",
        "points": ["Gift and dessert tables", "Comfortable guest layout", "Soft decor compatibility"]
      },
      {
        "title": "Corporate events",
        "copy": "A formal space for awards, company dinners, networking nights, and milestone events.",
        "image": "/images/luxor-lounge/luxor-lounge-corporate.png",
        "iconName": "Briefcase",
        "points": ["Dinner and presentation flow", "Networking layouts", "Awards and company moments"]
      }
    ],
    "planningSignals": [
      ["Guest arrival", "Where guests enter, gather, sign in, and find the main room."],
      ["Main moment", "Ceremony, entrance, toast, awards, cake, or first dance."],
      ["Dinner flow", "How tables, service paths, speeches, and family seating work together."],
      ["Photo plan", "Where the best backdrop moments should happen before the room gets busy."],
      ["Party energy", "How music, dancing, lighting, and late-night movement should feel."],
      ["Vendor setup", "What your planner, decorator, DJ, caterer, and photographer need to know."]
    ]
  }'::jsonb
) ON CONFLICT (page_name) DO NOTHING;

-- Insert default gallery page content
INSERT INTO public.luxor_site_content (page_name, content)
VALUES (
  'gallery',
  '{
    "filters": ["All", "Room", "Lounge", "Weddings", "Celebrations", "Corporate"],
    "gallery": [
      {
        "src": "/images/dining-hall/main-hall-wedding-wide.png",
        "title": "The main hall",
        "caption": "The finished hall dressed with dinner tables, florals, and a clear central aisle.",
        "category": "Room",
        "span": "lg:col-span-7 lg:row-span-2",
        "aspect": "aspect-[4/3] lg:aspect-auto lg:h-full",
        "sizes": "(min-width: 1024px) 58vw, 100vw"
      },
      {
        "src": "/images/dining-hall/main-hall-conversation-candid.png",
        "title": "Around the table",
        "caption": "A candid guest-level view of the room during a wedding reception.",
        "category": "Weddings",
        "span": "lg:col-span-5",
        "aspect": "aspect-[4/3] lg:aspect-auto lg:h-full",
        "sizes": "(min-width: 1024px) 42vw, 100vw"
      },
      {
        "src": "/images/dining-hall/main-hall-quinceanera-angle.png",
        "title": "Quinceañera reception",
        "caption": "Dusty rose details and a full dinner layout for a milestone celebration.",
        "category": "Celebrations",
        "span": "lg:col-span-5",
        "aspect": "aspect-[4/3] lg:aspect-auto lg:h-full",
        "sizes": "(min-width: 1024px) 42vw, 100vw"
      },
      {
        "src": "/images/dining-hall/main-hall-side-dance-candid.png",
        "title": "On the dance floor",
        "caption": "A close, spontaneous view of guests dancing alongside the dinner tables.",
        "category": "Weddings",
        "span": "lg:col-span-4",
        "aspect": "aspect-[4/3] lg:aspect-auto lg:h-full",
        "sizes": "(min-width: 1024px) 34vw, 100vw"
      },
      {
        "src": "/images/dining-hall/main-hall-corporate-cocktail.png",
        "title": "Corporate gathering",
        "caption": "A flexible cocktail and dinner setup for conversation and networking.",
        "category": "Corporate",
        "span": "lg:col-span-4",
        "aspect": "aspect-[4/3] lg:aspect-auto lg:h-full",
        "sizes": "(min-width: 1024px) 34vw, 100vw"
      },
      {
        "src": "/images/dining-hall/main-hall-table-toast-candid.png",
        "title": "A shared toast",
        "caption": "An intimate table-level moment surrounded by candlelight and florals.",
        "category": "Room",
        "span": "lg:col-span-4",
        "aspect": "aspect-[4/3] lg:aspect-auto lg:h-full",
        "sizes": "(min-width: 1024px) 34vw, 100vw"
      },
      {
        "src": "/images/luxor-lounge/luxor-lounge-empty.png",
        "title": "The Luxor Lounge",
        "caption": "A moody cocktail room with lounge seating, warm lighting, and flexible service space.",
        "category": "Lounge",
        "span": "lg:col-span-7 lg:row-span-2",
        "aspect": "aspect-[4/3] lg:aspect-auto lg:h-full",
        "sizes": "(min-width: 1024px) 58vw, 100vw"
      },
      {
        "src": "/images/luxor-lounge/luxor-lounge-family.png",
        "title": "Family gathering",
        "caption": "A comfortable setting for conversation across generations.",
        "category": "Lounge",
        "span": "lg:col-span-5",
        "aspect": "aspect-[4/3] lg:aspect-auto lg:h-full",
        "sizes": "(min-width: 1024px) 42vw, 100vw"
      },
      {
        "src": "/images/luxor-lounge/luxor-lounge-quinceanera.png",
        "title": "Court seating",
        "caption": "A pre-dinner gathering space for the court and close family.",
        "category": "Celebrations",
        "span": "lg:col-span-5",
        "aspect": "aspect-[4/3] lg:aspect-auto lg:h-full",
        "sizes": "(min-width: 1024px) 42vw, 100vw"
      },
      {
        "src": "/images/luxor-lounge/luxor-lounge-baby-shower.png",
        "title": "Showers and parties",
        "caption": "A softer layout with gift areas, dessert tables, and varied seating.",
        "category": "Celebrations",
        "span": "lg:col-span-7",
        "aspect": "aspect-[4/3] lg:aspect-auto lg:h-full",
        "sizes": "(min-width: 1024px) 58vw, 100vw"
      }
    ],
    "photoUses": [
      ["Imagine the layout", "Look at where tables are placed relative to the dance floor, entrances, and the main stage area."],
      ["Notice the lighting", "See how the room transitions from dinner ambiance to party energy with our built-in lighting systems."],
      ["Check the details", "Look at the chairs, table settings, and ceiling treatments that come as part of the venue base."]
    ]
  }'::jsonb
) ON CONFLICT (page_name) DO NOTHING;

-- Insert default pricing page content
INSERT INTO public.luxor_site_content (page_name, content)
VALUES (
  'pricing',
  '{
    "pricingPlans": [
      {
        "name": "Foundation",
        "badge": "Entry package",
        "summary": "A clean base package for hosts who want the room essentials handled without extras.",
        "bestFor": "Best for straightforward events that need the room set, dressed, and ready.",
        "includes": [
          "Tables",
          "Chairs",
          "Basic tablecloths",
          "Access to the lounge room",
          "VIP access"
        ],
        "variant": "light",
        "actionLabel": "Request Foundation quote"
      },
      {
        "name": "Signature",
        "badge": "Most chosen",
        "summary": "Everything in Foundation plus a light decor package that makes the room feel finished.",
        "bestFor": "Best for guests who want the next level of polish without going all in.",
        "includes": ["Everything in Foundation", "Light decor package"],
        "variant": "dark",
        "featured": true,
        "actionLabel": "Request Signature quote"
      },
      {
        "name": "Showpiece",
        "badge": "Full service",
        "summary": "Our complete package featuring enhanced floral centerpieces and premium finishes.",
        "bestFor": "Best for hosts who want the room fully designed and styled before they arrive.",
        "includes": ["Everything in Signature", "Floral centerpieces", "Full decor package"],
        "variant": "rose",
        "actionLabel": "Request Showpiece quote"
      }
    ]
  }'::jsonb
) ON CONFLICT (page_name) DO NOTHING;

-- Insert default visit page content
INSERT INTO public.luxor_site_content (page_name, content)
VALUES (
  'visit',
  '{
    "tourReasons": [
      "Confirm your guest flow",
      "Talk through packages and add-ons",
      "Check date availability",
      "Picture decor, photos, dinner, and dancing"
    ],
    "tourSteps": [
      ["Before", "Share your event type, rough guest count, date range, and the package level you are considering."],
      ["During", "Walk the room around entrance, seating, photos, music, dinner, decor, and the main celebration moment."],
      ["After", "Leave with a clearer package direction and a list of details to confirm before reserving your date."]
    ],
    "questions": [
      ["Should I tour before I know my exact guest count?", "Yes. A rough range is enough to start seeing which layouts make sense."],
      ["Can I compare packages during the visit?", "Yes. The tour should help connect the package tiers to the event you are actually planning."],
      ["What should I bring?", "Bring inspiration photos, target dates, guest count, and any must-have moments like entrance, cake, DJ, or photo booth."],
      ["How many guests can the venue hold?", "Capacity depends on the room, table layout, dance floor, entertainment, and service plan. Share your estimated guest count in the tour request so the team can confirm a realistic layout with you."],
      ["What should I know about parking and arrival?", "Parking and guest arrival details can vary with the event plan. The team will review the current parking arrangement, entrances, and vendor arrival path during your walkthrough."],
      ["Can Luxor accommodate accessibility needs?", "Tell us about any mobility, seating, restroom, or arrival accommodations your guests may need. The team will walk those needs with you in person before you reserve the date."],
      ["Can I bring my own caterer or bar service?", "Catering, beverage, and vendor requirements are confirmed for each event. Bring your preferred vendors or service ideas to the tour so the team can explain the current options and requirements."],
      ["How much setup and cleanup time is included?", "Access, setup, event, and cleanup timing are confirmed in your quote and event agreement. The walkthrough is the right time to map out vendor load-in and the complete event-day schedule."],
      ["How do deposits and cancellations work?", "Deposit amounts, payment timing, cancellation terms, damages, and refunds are provided in your proposal and signed event agreement. Ask the team to review those terms before you reserve a date."]
    ]
  }'::jsonb
) ON CONFLICT (page_name) DO NOTHING;

-- Insert default spaces page content
INSERT INTO public.luxor_site_content (page_name, content)
VALUES (
  'spaces',
  '{
    "zones": [
      ["Arrival", "A clear first impression for guests as they enter the room.", "DoorOpen"],
      ["Dinner", "Table layouts that keep speeches, service, and movement simple.", "Utensils"],
      ["Photos", "Dark, gold, and neutral details that hold up well in pictures.", "Camera"],
      ["Dance", "A room plan that leaves space for music, movement, and celebration.", "Music"]
    ],
    "spaceDetails": [
      ["Sightlines", "Where guests can see the couple, quinceañera court, speaker, cake, awards, or main table."],
      ["Vendor access", "The practical path for setup, teardown, music, decor, food, and photography."],
      ["Photo moments", "The places that should look intentional before guests start moving through the room."],
      ["Guest comfort", "How the layout feels during arrival, dinner, speeches, dancing, and exits."]
    ]
  }'::jsonb
) ON CONFLICT (page_name) DO NOTHING;
