"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type Lang = "en" | "sw";

/*
 * Interface text in Kiswahili. English is the key, so a string without an
 * entry simply shows in English rather than a blank. Placeholders like {name}
 * are filled in by `t`.
 */
const SW: Record<string, string> = {
  // shell and navigation
  "My account": "Akaunti yangu",
  Statement: "Taarifa ya akaunti",
  "Track collector": "Fuatilia gari la taka",
  "Book a pickup": "Omba kuzolewa",
  "Report dumping": "Ripoti utupaji taka",
  "Customer care": "Huduma kwa wateja",
  Dashboard: "Dashibodi",
  Clients: "Wateja",
  "Fleet map": "Ramani ya magari",
  "Fleet management": "Usimamizi wa magari",
  "My dashboard": "Dashibodi yangu",
  Security: "Usalama",
  Profile: "Wasifu",
  // profile
  "Your details": "Taarifa zako",
  Password: "Nenosiri",
  Preferences: "Mapendeleo",
  "Sign-ins": "Kuingia",
  "Your data": "Data yako",
  "Your details, password, preferences, where you're signed in, and a copy of your data.":
    "Taarifa zako, nenosiri, mapendeleo, mahali umeingia, na nakala ya data yako.",
  "Menus and messages in the app.": "Menyu na jumbe ndani ya programu.",
  Appearance: "Mwonekano",
  "Light, dark, or whatever your device uses.": "Mwangaza, giza, au kama kifaa chako kilivyo.",
  Auto: "Kiotomatiki",
  Light: "Mwangaza",
  Dark: "Giza",
  "Messages from {company} outside the app. You'll always see everything in the app.":
    "Jumbe kutoka {company} nje ya programu. Utaona kila kitu ndani ya programu kila wakati.",
  "Billing SMS": "SMS za malipo",
  "Invoices, receipts and payment reminders.": "Ankara, risiti na vikumbusho vya malipo.",
  "Collection SMS": "SMS za uzoaji taka",
  "Scheduled pickups and missed collections.": "Uzoaji uliopangwa na uliokosa.",
  "Customer care SMS": "SMS za huduma kwa wateja",
  "When the care team replies or opens a request for you.": "Timu ya huduma inapojibu au kukufungulia ombi.",
  "Customer care email": "Barua pepe za huduma kwa wateja",
  "The same care replies by email.": "Majibu hayo hayo kwa barua pepe.",
  "Sign-in codes are always sent. Some messages depend on your provider's package.":
    "Nambari za kuingia hutumwa kila wakati. Baadhi ya jumbe hutegemea kifurushi cha mtoa huduma wako.",
  "M-Pesa number": "Nambari ya M-Pesa",
  "Number for payment prompts": "Nambari ya maombi ya malipo",
  "Leave blank to use your contact number, {phone}.": "Acha wazi kutumia nambari yako ya mawasiliano, {phone}.",
  "M-Pesa number saved.": "Nambari ya M-Pesa imehifadhiwa.",
  "M-Pesa prompts will go to your contact number.": "Maombi ya M-Pesa yatatumwa kwa nambari yako ya mawasiliano.",
  Save: "Hifadhi",
  "Where you're signed in": "Mahali umeingia",
  "Sign out everywhere else": "Toka kwingine kote",
  "This sign-in started before devices were recorded, so it isn't listed. Sign in again to see it here.":
    "Kuingia huku kulianza kabla vifaa havijarekodiwa, kwa hivyo hakuonyeshwi. Ingia tena ukione hapa.",
  "No sign-ins recorded in the last 90 days.": "Hakuna kuingia kulikorekodiwa katika siku 90 zilizopita.",
  "This device": "Kifaa hiki",
  "Signed out": "Umetoka",
  "Signed in": "Uliingia",
  "last active": "mara ya mwisho",
  "Don't recognise one? Sign it out and change your password.": "Hukitambui kimoja? Kitoe na ubadilishe nenosiri lako.",
  "Download your data": "Pakua data yako",
  "A copy of your account, statement, collections, pickup requests and conversations, as a JSON file.":
    "Nakala ya akaunti yako, taarifa, uzoaji, maombi ya kuzolewa na mazungumzo, kama faili ya JSON.",
  Download: "Pakua",
  "Delete your account": "Futa akaunti yako",
  "{company} closes the account and removes your personal data once any balance is settled. Billing records are kept for five years, as the law requires.":
    "{company} hufunga akaunti na kuondoa data yako binafsi baada ya salio kulipwa. Rekodi za malipo huhifadhiwa kwa miaka mitano, kama sheria inavyotaka.",
  "Reason (optional)": "Sababu (si lazima)",
  "Request deletion": "Omba kufutwa",
  "Ask {company} to close your account and delete your personal data?":
    "Uombe {company} ifunge akaunti yako na kufuta data yako binafsi?",
  "You've already asked; it's request {id}.": "Tayari umeomba; ni ombi {id}.",
  "Request {id} sent.": "Ombi {id} limetumwa.",
  "Request {id} sent. You'll get a reply in Customer care.": "Ombi {id} limetumwa. Utapata jibu katika Huduma kwa wateja.",
  "Care assistant": "Msaidizi wa huduma",
  "Our assistant is answering.": "Msaidizi wetu anajibu.",
  "Talk to a person": "Ongea na mtu",
  "Passed to the care team.": "Imepelekwa kwa timu ya huduma.",
  "Care package": "Kifurushi cha huduma",
  "Chat agent": "Mazungumzo na wateja",
  Tickets: "Tiketi",
  Invoices: "Ankara",
  "Staff & departments": "Wafanyakazi na idara",
  Staff: "Wafanyakazi",
  Departments: "Idara",
  "My truck": "Lori langu",
  "M-Pesa payments": "Malipo ya M-Pesa",
  "Arrears & reminders": "Madeni na vikumbusho",
  Statements: "Taarifa za akaunti",
  "Pickup requests": "Maombi ya kuzolewa",
  "Dumping reports": "Ripoti za utupaji taka",
  Recycling: "Urejelezaji",
  Settings: "Mipangilio",
  "Audit log": "Kumbukumbu za mabadiliko",
  "Today’s route": "Njia ya leo",
  "My location": "Mahali nilipo",
  Overview: "Muhtasari",
  "Client database": "Hifadhidata ya wateja",
  "City map": "Ramani ya jiji",
  "Roles & permissions": "Majukumu na ruhusa",
  Users: "Watumiaji",
  Menu: "Menyu",
  "Demo mode": "Hali ya majaribio",
  "Live payments": "Malipo halisi",
  Client: "Mteja",
  Company: "Kampuni",
  Collector: "Mzoa taka",
  Admin: "Msimamizi",
  "Seed data. M-Pesa calls are simulated; no money moves.":
    "Data ya majaribio. M-Pesa inaigwa; hakuna pesa inayotumwa.",
  "Payments are live on M-Pesa for this company.": "Malipo ya M-Pesa ni halisi kwa kampuni hii.",
  "Sign out": "Toka",
  Language: "Lugha",

  // client home
  "Karibu, {name}": "Karibu, {name}",
  "Your collection account with {company}.": "Akaunti yako ya kuzoa taka na {company}.",
  "Client number": "Nambari ya mteja",
  "Copy number": "Nakili nambari",
  "Use it as the account number on Paybill": "Itumie kama nambari ya akaunti kwenye Paybill",
  "Amount due": "Kiasi unachodaiwa",
  "In credit": "Salio la ziada",
  Balance: "Salio",
  "{type} plan · {amount} per month": "Mpango wa {type} · {amount} kwa mwezi",
  "Pay with M-Pesa": "Lipa kwa M-Pesa",
  "View statement": "Angalia taarifa",
  "Or pay via Lipa na M-Pesa": "Au lipa kupitia Lipa na M-Pesa",
  "Business no.": "Nambari ya biashara",
  "Account no.": "Nambari ya akaunti",
  Amount: "Kiasi",
  "Payments post to your account automatically within a minute.":
    "Malipo huingia kwenye akaunti yako yenyewe ndani ya dakika moja.",
  Collection: "Uzoaji taka",
  "Next pickup": "Siku ijayo ya kuzoa",
  "Last collected": "Ilizolewa mwisho",
  "Your truck": "Gari lako",
  Unassigned: "Bado halijapangwa",
  Track: "Fuatilia",
  Proof: "Ushahidi",
  "Your recycling": "Urejelezaji wako",
  "collected in the last 30 days": "zilizozolewa siku 30 zilizopita",
  "kept out of the dump site": "hazikupelekwa jaa",
  "Recent activity": "Shughuli za karibuni",
  Today: "Leo",
  Household: "Nyumbani",
  Business: "Biashara",
  mixed: "mchanganyiko",
  recyclable: "zinazorejelezwa",
  organic: "za kuoza",
  residual: "zilizobaki",
  Tomorrow: "Kesho",

  company: "kampuni",
  sequence: "mfuatano",
  "check digit": "tarakimu ya uthibitisho",
  "Statement period": "Kipindi cha taarifa",
  "Last seen {when}": "Lilionekana mwisho {when}",
  "Positions update from the driver’s phone, or follow the planned route when GPS isn’t shared.":
    "Mahali pa magari husasishwa kutoka simu ya dereva, au hufuata njia iliyopangwa GPS isipotumwa.",

  // statement
  "Running account for {name} · {id} · {company}": "Akaunti ya {name} · {id} · {company}",
  Date: "Tarehe",
  Description: "Maelezo",
  "M-Pesa ref": "Kumbukumbu ya M-Pesa",
  Charge: "Ada",
  Paid: "Imelipwa",
  "Opening balance": "Salio la mwanzo",
  "Closing balance": "Salio la mwisho",
  "All time": "Tangu mwanzo",
  "Amounts in KES. Positive balance = amount owed; negative = credit carried forward.":
    "Kiasi kwa KES. Salio chanya = deni; hasi = salio la ziada litakalotumika baadaye.",
  "Owes {amount}": "Deni {amount}",
  "Credit {amount}": "Ziada {amount}",
  "Paid up": "Hakuna deni",

  // tracking
  "Track your collector": "Fuatilia gari la taka",
  "Live positions of {company} trucks. Your gate is marked in yellow.":
    "Mahali magari ya {company} yalipo sasa. Geti lako limewekwa alama ya njano.",
  "{company} fleet": "Magari ya {company}",
  "serves your estate": "linahudumia mtaa wako",
  "≈ {n} min away": "≈ dakika {n} kufika",
  "On route": "Liko njiani",
  "Location paused": "Mahali pamesitishwa",
  Offline: "Nje ya mtandao",

  // pickups
  "Extra and bulky collections on top of your regular days. Pay by M-Pesa now, or with your next bill.":
    "Uzoaji wa ziada na wa vitu vikubwa, mbali na siku zako za kawaida. Lipa kwa M-Pesa sasa, au na bili yako ijayo.",
  "What needs collecting?": "Nini kizolewe?",
  "Bulky items": "Vitu vikubwa",
  "Garden waste": "Taka za bustani",
  "Construction rubble": "Kifusi cha ujenzi",
  "Extra bag collection": "Mifuko ya ziada",
  "Event clean-up": "Usafi baada ya sherehe",
  "Preferred date": "Tarehe unayopendelea",
  "Notes for the crew": "Maelezo kwa wafanyakazi",
  "What and how much, where it is, gate details": "Nini na kiasi gani, kiko wapi, maelezo ya geti",
  "Add a photo (helps the crew bring the right truck)":
    "Ongeza picha (inasaidia kuleta gari linalofaa)",
  "Book for {amount}": "Omba kwa {amount}",
  "We’ll confirm the date by SMS.": "Tutathibitisha tarehe kwa SMS.",
  "Your requests": "Maombi yako",
  "No pickups booked yet.": "Bado hujaomba kuzolewa.",
  Pay: "Lipa",
  Cancel: "Ghairi",
  Requested: "Imeombwa",
  Scheduled: "Imepangwa",
  Completed: "Imekamilika",
  Cancelled: "Imeghairiwa",

  "Scheduled {date}": "Imepangwa {date}",
  "Wanted {date}": "Inahitajika {date}",
  "Request cancelled": "Ombi limeghairiwa",
  "Pickup booked": "Ombi la kuzolewa limepokelewa",

  // dumping
  "Couldn't read your location. Tap the map where the dumping is instead.":
    "Hatukuweza kupata mahali ulipo. Gusa ramani mahali taka zilipotupwa.",
  "Tap the map, or use your location, to show where it is.":
    "Gusa ramani, au tumia mahali ulipo, kuonyesha ziko wapi.",
  "Thank you.": "Asante.",
  "How much": "Kiasi gani",
  "e.g. Construction rubble and old mattresses by the stream":
    "mf. Kifusi cha ujenzi na magodoro ya zamani kando ya mto",
  "Outside our estates": "Nje ya mitaa yetu",
  New: "Mpya",
  Assigned: "Imepangiwa wafanyakazi",
  Cleared: "Imesafishwa",
  "Report illegal dumping": "Ripoti utupaji taka haramu",
  "Show us where rubbish has been dumped. It goes to the company that serves the area.":
    "Tuonyeshe taka zilipotupwa. Ripoti inaenda kwa kampuni inayohudumia eneo hilo.",
  "Where is it?": "Ziko wapi?",
  "Use my location": "Tumia mahali nilipo",
  "Or tap the map.": "Au gusa ramani.",
  "A few bags": "Mifuko michache",
  "A pile (car boot)": "Rundo (buti ya gari)",
  "Lorry load": "Lori zima",
  "What was dumped?": "Nini kilitupwa?",
  "Add a photo": "Ongeza picha",
  "Send report": "Tuma ripoti",
  "Your reports": "Ripoti zako",
  "You haven’t reported anything yet.": "Bado hujaripoti chochote.",

  // customer care
  "Messages go straight to {company}’s care desk.":
    "Ujumbe unaenda moja kwa moja kwa huduma kwa wateja ya {company}.",
  "Your conversations · {n}": "Mazungumzo yako · {n}",
  "New request": "Ombi jipya",
  "What can we help with? Press send and {company} will reply right here.":
    "Tukusaidie na nini? Bonyeza tuma na {company} watajibu hapa hapa.",
  "Good morning": "Habari za asubuhi",
  "Good afternoon": "Habari za mchana",
  "Good evening": "Habari za jioni",
  "Describe the problem…": "Eleza tatizo…",
  "Write a message…": "Andika ujumbe…",
  "Enter to send · Shift+Enter for a new line": "Enter kutuma · Shift+Enter kwa mstari mpya",
  You: "Wewe",
  Topic: "Mada",
  "Missed pickup": "Taka hazikuzolewa",
  Billing: "Malipo",
  "Bin request": "Ombi la pipa",
  Schedule: "Ratiba",
  Other: "Nyingine",
  Open: "Wazi",
  Pending: "Inasubiri",
  Resolved: "Imetatuliwa",
  "Translate to {lang}": "Tafsiri kwa {lang}",
  "Translating…": "Inatafsiri…",
  "Start a new request": "Anza ombi jipya",
  "You can read this conversation but not reply.":
    "Unaweza kusoma mazungumzo haya lakini huwezi kujibu.",
  Copy: "Nakili",

  // payment sheet
  "We’ll send a payment prompt to your phone (STK Push).":
    "Tutatuma ombi la malipo kwenye simu yako (STK Push).",
  "Live M-Pesa": "M-Pesa halisi",
  "Simulated: no money moves": "Majaribio: hakuna pesa inayotumwa",
  "M-Pesa phone number": "Nambari ya simu ya M-Pesa",
  "Amount (KES)": "Kiasi (KES)",
  "Send prompt": "Tuma ombi",
  "Check your phone": "Angalia simu yako",
  "Confirming payment…": "Tunathibitisha malipo…",
  "Payment received": "Malipo yamepokelewa",
  "Payment not completed": "Malipo hayakukamilika",
  "Nothing was charged.": "Hakuna pesa iliyotolewa.",
  "Try again": "Jaribu tena",
  Close: "Funga",
  Done: "Imekamilika",
  "New balance:": "Salio jipya:",
  "This is what appears on {phone}. The PIN is entered on the phone, never on this site.":
    "Hivi ndivyo inavyoonekana kwenye {phone}. PIN huwekwa kwenye simu, kamwe si kwenye tovuti hii.",
  "Approve (simulate)": "Kubali (majaribio)",
  "An M-Pesa prompt for KES {amount} was sent to {phone}. Enter your PIN there; this updates by itself once Safaricom confirms.":
    "Ombi la M-Pesa la KES {amount} limetumwa kwa {phone}. Weka PIN yako hapo; ukurasa huu utajisasisha Safaricom wakithibitisha.",
  "Waiting for the payment confirmation.": "Tunasubiri uthibitisho wa malipo.",
  "The request was cancelled on the phone.": "Ombi liliachwa kwenye simu.",
  "Sending…": "Inatuma…",
  Notifications: "Arifa",
  "Collapse sidebar": "Kunja upau wa pembeni",
  "Expand sidebar": "Panua upau wa pembeni",
  "Open menu": "Fungua menyu",
  "Close menu": "Funga menyu",
  "Mark all read": "Weka zote zimesomwa",
  "You're all caught up.": "Huna arifa mpya.",
  "Customer care replied": "Huduma kwa wateja wamejibu",
  "Pickup scheduled": "Uchukuzi umepangwa",
  "Pickup completed": "Uchukuzi umekamilika",
  "Dumping site cleared": "Eneo la utupaji limesafishwa",
  "Message from {name}": "Ujumbe kutoka kwa {name}",
  "New pickup request": "Ombi jipya la uchukuzi",
  "Illegal dumping reported": "Utupaji haramu umeripotiwa",
  "Your client reported dumping": "Mteja wako ameripoti utupaji",
  "Unmatched payment": "Malipo yasiyolinganishwa",
  "Pickup added to your route": "Uchukuzi umeongezwa kwenye njia yako",
  "just now": "sasa hivi",
  "{n} min ago": "dakika {n} zilizopita",
  "{n} h ago": "saa {n} zilizopita",
  "{n} d ago": "siku {n} zilizopita",
};

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let text = lang === "sw" ? (SW[key] ?? key) : key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

interface LangValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LangContext = createContext<LangValue>({
  lang: "en",
  setLang: () => {},
  t: (key, vars) => translate("en", key, vars),
});

export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    document.documentElement.lang = next;
  }, []);
  const value = useMemo<LangValue>(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang],
  );
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useT = () => useContext(LangContext);
