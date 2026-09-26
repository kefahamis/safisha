import {
  ArrowUpRight,
  BadgeCheck,
  Building2,
  CalendarCheck,
  Camera,
  Check,
  ClipboardList,
  Headset,
  Home,
  Languages,
  Leaf,
  MapPinned,
  MessageSquareText,
  Phone,
  Radio,
  Recycle,
  Smartphone,
  TriangleAlert,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PlatformIdentity } from "@/components/layout/PlatformBrand";
import { DAYS, group, kes } from "@/lib/format";
import { COMPANIES } from "@/lib/reference/companies";
import { ESTATES, estateName } from "@/lib/reference/estates";
import type { SiteStats } from "@/server/siteStats";
import { BackToTop } from "./BackToTop";
import { CoverageFinder } from "./CoverageFinder";
import { SiteEffects } from "./SiteEffects";
import { SiteNav } from "./SiteNav";

/** Pill button with the round arrow chip, the reference's signature control. */
function Btn({ href, children, variant = "lime" }: { href: string; children: ReactNode; variant?: "lime" | "ghost" | "dark" }) {
  return (
    <Link href={href} className={`s-btn ${variant}`}>
      {children}
      <span className="s-btn-chip" aria-hidden="true">
        <ArrowUpRight size={15} strokeWidth={2.4} />
      </span>
    </Link>
  );
}

function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return <div className={`s-eyebrow${light ? " light" : ""}`}>{children}</div>;
}

const SERVICES: { icon: LucideIcon; title: string; text: string; points: string[]; href: string }[] = [
  {
    icon: Home,
    title: "Household collection",
    text: "A licensed crew at your gate on your estate's collection days, every week, with a photo as proof.",
    points: ["Weekly or twice-weekly rounds", "Proof-of-collection photos", "Live truck tracking"],
    href: "/login?next=/client",
  },
  {
    icon: Building2,
    title: "Businesses & estates",
    text: "Shops, apartments and offices on a plan that fits their volume, billed monthly to one account number.",
    points: ["Apartment blocks and markets", "Monthly statements", "Weights recorded at every stop"],
    href: "/login?next=/client",
  },
  {
    icon: ClipboardList,
    title: "On-demand pickups",
    text: "Bulky items, garden waste, rubble or a one-off clean-up, booked and paid for from your phone.",
    points: ["Bulky items and furniture", "Garden waste and rubble", "Event clean-ups"],
    href: "/login?next=/client/pickups",
  },
  {
    icon: TriangleAlert,
    title: "Report illegal dumping",
    text: "Pin a dump site on the map with a photo. It goes to the company serving that estate, or the county.",
    points: ["Photo and map pin", "Routed to the right crew", "Told when it's cleared"],
    href: "/login?next=/client/report",
  },
  {
    icon: Recycle,
    title: "Recycling & impact",
    text: "Every stop records the stream — recyclable, organic, mixed or residual — so you see what stays out of Dandora.",
    points: ["Sorted at the gate", "Monthly recycling figures", "Less to the dumpsite"],
    href: "/login?next=/client",
  },
  {
    icon: Wallet,
    title: "Pay by M-Pesa",
    text: "Pay your collector's Paybill with your account number, or approve a prompt on your phone. It posts in a minute.",
    points: ["Paybill or STK prompt", "Running statement", "SMS reminders before you fall behind"],
    href: "/login?next=/client",
  },
];

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: BadgeCheck, title: "Get your account number", text: "Your collection company registers you and texts a number like TS-KIL-02436. It's also your Paybill account." },
  { icon: Smartphone, title: "Pay by M-Pesa", text: "Lipa na M-Pesa → Paybill → your company's number, account = your client number. Or approve the prompt we send." },
  { icon: MapPinned, title: "Watch your truck", text: "See the truck on its way on collection days, and the time it was at your gate." },
  { icon: MessageSquareText, title: "Talk to care", text: "Chat in English, Kiswahili or Sheng. Missed pickups and billing questions become tickets someone owns." },
];

const CREDITS = [
  { what: "Crew at a truck", who: "Carl Campbell", href: "https://unsplash.com/photos/stzGl8p5Vio" },
  { what: "Crew with carts", who: "Bernd Dittrich", href: "https://unsplash.com/photos/F1g6carYk4I" },
  { what: "Loading a bin", who: "zibik", href: "https://unsplash.com/photos/iR4mClggzEU" },
  { what: "Sorting bins", who: "Nareeta Martin", href: "https://unsplash.com/photos/FoG7PKNYjpM" },
  { what: "Bottles", who: "Jas Min", href: "https://unsplash.com/photos/CIItgnBEOgw" },
  { what: "Cans", who: "Evgeny Karchevsky", href: "https://unsplash.com/photos/k1tUxfs8JYY" },
];

/**
 * The public website: what the platform does, for residents, businesses and
 * collection companies, in the reference's layout and the platform's colours.
 * Every figure comes from the live data.
 */
export function PublicSite({
  stats,
  signedIn,
  name,
  fullName,
  year,
}: {
  stats: SiteStats;
  signedIn: boolean;
  /** The platform's short name, e.g. "Zoa". */
  name: string;
  /** Its full name, as it holds the copyright, e.g. "Zoa Waste Hub". */
  fullName: string;
  /** The current year in Nairobi. */
  year: number;
}) {
  const estates = Object.values(ESTATES)
    .map((e) => {
      const co = COMPANIES.find((c) => c.estates.includes(e.code));
      return {
        code: e.code,
        name: e.name,
        days: e.days.map((d) => DAYS[d]),
        company: co?.name ?? "County",
        companyColor: co?.color ?? "#8AA39B",
        paybill: co?.paybill ?? "—",
        care: co?.care ?? "—",
        hours: co?.hours ?? "",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const home = signedIn ? "/start" : "/login";

  return (
    <div className="site">
      <SiteNav signedIn={signedIn} />

      {/* ---------------- hero ---------------- */}
      <section className="s-hero" id="top">
        <div className="s-hero-bg" aria-hidden="true" />
        <div className="s-wrap s-hero-inner">
          <div className="s-hero-copy">
            <Eyebrow light>Licensed waste collection across Nairobi</Eyebrow>
            <h1>
              A cleaner Nairobi starts <em className="s-serif">at your gate</em>
            </h1>
            <p className="s-lead">
              {name} brings your collection company, your M-Pesa payments and your truck&rsquo;s whereabouts into one place, so the
              bins go out and the bill gets paid without a phone call.
            </p>
            <div className="s-actions">
              <Btn href={signedIn ? "/start" : "/login?next=/client"}>{signedIn ? "Open dashboard" : "Pay your bill"}</Btn>
              <Btn href="#coverage" variant="ghost">
                Find your collection day
              </Btn>
            </div>
            <div className="s-hero-proof">
              <div className="s-bubbles" aria-hidden="true">
                {Object.values(ESTATES)
                  .slice(0, 4)
                  .map((e) => (
                    <span key={e.code}>{e.code}</span>
                  ))}
                <span className="more">+{Math.max(0, stats.estates - 4)}</span>
              </div>
              <div>
                <b>
                  {stats.estates} estates · {stats.companies} licensed companies
                </b>
                <span>{group(stats.clients)} households and businesses on the platform</span>
              </div>
            </div>
          </div>

          <aside className="s-live" aria-label="Live figures">
            <div className="s-live-top">
              <span className="s-live-icon" aria-hidden="true">
                <Radio size={20} strokeWidth={2.2} />
              </span>
              <div>
                <b>
                  {stats.trucksOnRoute} of {stats.trucks} trucks
                </b>
                <span>sharing their location now</span>
              </div>
            </div>
            <div className="s-live-title">Collections, last 30 days</div>
            <div className="s-meter">
              <div className="s-meter-row">
                <span>Pickups completed</span>
                <b>{group(stats.pickups30)}</b>
              </div>
            </div>
            {stats.completionPct !== undefined && (
              <div className="s-meter">
                <div className="s-meter-row">
                  <span>Stops completed</span>
                  <b>{stats.completionPct}%</b>
                </div>
                <i style={{ width: `${stats.completionPct}%` }} />
              </div>
            )}
            <div className="s-meter">
              <div className="s-meter-row">
                <span>Kept out of the dumpsite</span>
                <b>{stats.divertedPct}%</b>
              </div>
              <i style={{ width: `${stats.divertedPct}%` }} />
            </div>
          </aside>
        </div>
      </section>

      {/* ---------------- estates ticker ---------------- */}
      <div className="s-ticker" aria-hidden="true">
        <div className="s-ticker-track">
          {[0, 1].map((copy) => (
            <div className="s-ticker-set" key={copy}>
              {Object.values(ESTATES).map((e) => (
                <span key={e.code}>
                  {e.name}
                  <Leaf size={14} strokeWidth={2.2} />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ---------------- band ---------------- */}
      <section className="s-band">
        <div className="s-wrap s-band-inner">
          <span className="s-band-truck" aria-hidden="true">
            <Truck size={34} strokeWidth={1.8} />
          </span>
          <h2>
            Missed a pickup? <br />
            <em className="s-serif">Sorted in one message.</em>
          </h2>
          <div className="s-band-call">
            <span className="s-band-phone" aria-hidden="true">
              <Phone size={20} strokeWidth={2.2} />
            </span>
            <div>
              <span>{stats.ussdCode ? "No smartphone? Dial" : "Report it from your phone"}</span>
              <b>{stats.ussdCode ?? "In the app, in seconds"}</b>
            </div>
          </div>
          <Btn href="/login?next=/client/support">Report it</Btn>
        </div>
      </section>

      {/* ---------------- about ---------------- */}
      <section className="s-about s-cream" id="about">
        <div className="s-wrap s-about-grid">
          <div>
            <Eyebrow>About the platform</Eyebrow>
            <h2 data-reveal>
              One platform for every bin, bill and truck <em className="s-serif">in the estate</em>
            </h2>
            <p>
              Collection companies run their clients, crews, fleet and books here. Residents and businesses pay, track and get
              help in the same place. Everyone sees the same record, so a missed pickup or a lost payment is a quick fix, not an
              argument.
            </p>
            <div className="s-about-card" data-reveal>
              <img src="/site/loading-bin.jpg" alt="A collection crew loading a bin into a truck" loading="lazy" />
              <ul>
                {["M-Pesa Paybill and payment prompts", "Proof of collection at every gate", "Live truck tracking", "Care in English, Kiswahili and Sheng"].map(
                  (x) => (
                    <li key={x}>
                      <span className="s-tick" aria-hidden="true">
                        <Check size={13} strokeWidth={3} />
                      </span>
                      {x}
                    </li>
                  ),
                )}
              </ul>
            </div>
            <div className="s-actions">
              <Btn href="#how">How it works</Btn>
              <span className="s-about-note">
                <Languages size={16} strokeWidth={2.2} aria-hidden="true" />
                English · Kiswahili · Sheng
              </span>
            </div>
          </div>
          <div className="s-about-photo" data-reveal="right">
            <img src="/site/crew-carts.jpg" alt="A collection crew with a truck and hand carts" loading="lazy" />
            <div className="s-badge">
              <b>{stats.estates}</b>
              <span>Estates served</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- figures ---------------- */}
      <section className="s-stats" aria-label="In numbers">
        <div className="s-wrap s-stats-row">
          <div>
            <b data-count={stats.clients}>{group(stats.clients)}</b>
            <span>
              Households and businesses
              <br />
              on the platform
            </span>
          </div>
          <div>
            <b data-count={stats.tonnes30} data-decimals="1" data-suffix=" t">
              {stats.tonnes30.toLocaleString("en-KE")} t
            </b>
            <span>
              Collected and weighed
              <br />
              in the last 30 days
            </span>
          </div>
          <div>
            <b data-count={stats.divertedPct} data-suffix="%">
              {stats.divertedPct}%
            </b>
            <span>
              Recyclable or organic,
              <br />
              kept out of Dandora
            </span>
          </div>
        </div>
      </section>

      {/* ---------------- services ---------------- */}
      <section className="s-services s-dark" id="services">
        <div className="s-wrap">
          <div className="s-head">
            <div>
              <Eyebrow light>Our services</Eyebrow>
              <h2>
                Everything waste, <em className="s-serif">handled</em>
              </h2>
              <p>From the weekly round to the sofa that won&rsquo;t fit in the bin, booked, paid and tracked from your phone.</p>
            </div>
            <Btn href="/login?next=/client/pickups">Book a pickup</Btn>
          </div>
          <div className="s-cards" data-reveal-group>
            {SERVICES.map((sv) => (
              <Link key={sv.title} href={sv.href} className="s-card">
                <span className="s-card-go" aria-hidden="true">
                  <ArrowUpRight size={16} strokeWidth={2.4} />
                </span>
                <sv.icon size={30} strokeWidth={1.6} className="s-card-icon" aria-hidden="true" />
                <h3>{sv.title}</h3>
                <p>{sv.text}</p>
                <ul>
                  {sv.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                {sv.title === "On-demand pickups" && stats.pickupFrom > 0 && <span className="s-card-price">From {kes(stats.pickupFrom)}</span>}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- how it works ---------------- */}
      <section className="s-how s-cream" id="how">
        <div className="s-wrap">
          <div className="s-head center">
            <div>
              <Eyebrow>How it works</Eyebrow>
              <h2>
                Four steps to a bin that <em className="s-serif">just gets emptied</em>
              </h2>
            </div>
          </div>
          <ol className="s-steps" data-reveal-group>
            {STEPS.map((st, i) => (
              <li key={st.title}>
                <span className="s-step-n">{String(i + 1).padStart(2, "0")}</span>
                <span className="s-step-icon" aria-hidden="true">
                  <st.icon size={22} strokeWidth={2} />
                </span>
                <h3>{st.title}</h3>
                <p>{st.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- coverage ---------------- */}
      <section className="s-coverage" id="coverage">
        <div className="s-wrap s-coverage-grid">
          <div>
            <Eyebrow>Coverage</Eyebrow>
            <h2>
              When is my <em className="s-serif">collection day?</em>
            </h2>
            <p>Pick your estate to see who collects there, which days, and where to pay.</p>
          </div>
          <div data-reveal>
            <CoverageFinder estates={estates} />
          </div>
        </div>
      </section>

      {/* ---------------- recycling ---------------- */}
      <section className="s-impact s-cream">
        <div className="s-wrap s-impact-grid">
          <div className="s-mosaic" aria-hidden="true" data-reveal="left">
            <img src="/site/sorting-bins.jpg" alt="" loading="lazy" />
            <img src="/site/bottles.jpg" alt="" loading="lazy" />
            <img src="/site/cans.jpg" alt="" loading="lazy" />
          </div>
          <div>
            <Eyebrow>Recycling</Eyebrow>
            <h2>
              Less to Dandora, <em className="s-serif">one gate at a time</em>
            </h2>
            <p>
              Crews record what they collect at every stop, by weight and by stream. Clients see their own recycling figures;
              companies and the county see the whole city&rsquo;s.
            </p>
            <div className="s-impact-stats">
              <div>
                <Leaf size={20} strokeWidth={2.2} aria-hidden="true" />
                <b>{stats.divertedPct}%</b>
                <span>recyclable or organic in the last 30 days</span>
              </div>
              <div>
                <Camera size={20} strokeWidth={2.2} aria-hidden="true" />
                <b>{group(stats.pickups30)}</b>
                <span>collections with proof in the last 30 days</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- companies ---------------- */}
      <section className="s-companies" id="companies">
        <div className="s-wrap">
          <div className="s-head">
            <div>
              <Eyebrow>Licensed companies</Eyebrow>
              <h2>
                The crews behind <em className="s-serif">your collection</em>
              </h2>
              <p>Each company serves its own estates, with its own Paybill and care line.</p>
            </div>
            <Btn href={home} variant="dark">
              {signedIn ? "Open dashboard" : "Company sign-in"}
            </Btn>
          </div>
          <div className="s-co-grid" data-reveal-group>
            {COMPANIES.map((c) => (
              <article key={c.id} className="s-co">
                <div className="s-co-head">
                  <span className="s-co-mark" style={{ background: c.color }} aria-hidden="true">
                    {c.id}
                  </span>
                  <h3>{c.name}</h3>
                </div>
                <div className="s-co-estates">
                  {c.estates.map((e) => (
                    <span key={e}>{estateName(e)}</span>
                  ))}
                </div>
                <dl>
                  <div>
                    <dt>Paybill</dt>
                    <dd className="mono">{c.paybill}</dd>
                  </div>
                  <div>
                    <dt>Care</dt>
                    <dd>
                      <a href={`tel:${c.care.replace(/\s/g, "")}`}>{c.care}</a>
                    </dd>
                  </div>
                  <div>
                    <dt>Hours</dt>
                    <dd>{c.hours}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- closing call ---------------- */}
      <section className="s-final s-dark">
        <div className="s-wrap s-final-inner">
          <div>
            <Eyebrow light>Get started</Eyebrow>
            <h2>
              Your account, your truck and your bill, <em className="s-serif">on your phone</em>
            </h2>
            <p>Sign in with the email or phone number your collection company registered, or with a one-time code by SMS.</p>
          </div>
          <div className="s-actions">
            <Btn href={home}>{signedIn ? "Open dashboard" : "Sign in"}</Btn>
            {!signedIn && (
              <Btn href="/login/code" variant="ghost">
                Sign in with a code
              </Btn>
            )}
          </div>
        </div>
      </section>

      {/* ---------------- footer ---------------- */}
      <footer className="s-footer" id="contact">
        <div className="s-wrap s-footer-grid">
          <div className="s-footer-brand">
            <div className="s-brand light">
              <PlatformIdentity markSize={36} />
            </div>
            <p>Waste collection, M-Pesa billing and fleet tracking for Nairobi&rsquo;s licensed collection companies.</p>
          </div>
          <div>
            <h4>Platform</h4>
            <ul>
              <li>
                <a href="#services">Services</a>
              </li>
              <li>
                <a href="#how">How it works</a>
              </li>
              <li>
                <a href="#coverage">Collection days</a>
              </li>
              <li>
                <Link href={home}>{signedIn ? "Dashboard" : "Sign in"}</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Care lines</h4>
            <ul>
              {COMPANIES.map((c) => (
                <li key={c.id}>
                  <span>{c.name}</span>
                  <a href={`tel:${c.care.replace(/\s/g, "")}`}>{c.care}</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Get help</h4>
            <ul>
              <li className="with-ico">
                <Headset size={15} strokeWidth={2.2} aria-hidden="true" />
                Chat in the app
              </li>
              {stats.ussdCode && (
                <li className="with-ico">
                  <Phone size={15} strokeWidth={2.2} aria-hidden="true" />
                  Dial {stats.ussdCode}
                </li>
              )}
              <li className="with-ico">
                <CalendarCheck size={15} strokeWidth={2.2} aria-hidden="true" />
                <a href="#coverage">Your collection days</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="s-wordmark" aria-hidden="true">
          {name}
        </div>
        <div className="s-wrap s-footer-base">
          <span>
            Copyright &copy; {year} {fullName}. All rights reserved.
          </span>
          {/* The photos aren't ours: each stays its photographer's, used under the Unsplash Licence. */}
          <span className="s-credits">
            Photographs &copy;{" "}
            {CREDITS.map((c, i) => (
              <span key={c.href}>
                <a href={c.href} target="_blank" rel="noreferrer">
                  {c.who}
                </a>
                {i < CREDITS.length - 2 ? ", " : i === CREDITS.length - 2 ? " and " : ""}
              </span>
            ))}
            , used under the{" "}
            <a href="https://unsplash.com/license" target="_blank" rel="noreferrer">
              Unsplash Licence
            </a>
            .
          </span>
        </div>
      </footer>

      <BackToTop />
      <SiteEffects />
    </div>
  );
}
