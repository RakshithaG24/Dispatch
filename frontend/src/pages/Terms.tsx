import { LegalPage, LegalSection } from "../components/LegalPage";
import { site } from "../config/site";

const sections: LegalSection[] = [
  {
    heading: "Agreement",
    body: (
      <p>
        By signing in to {site.product} you agree to these terms with {site.company}. If you do not agree, do not use the service.
      </p>
    ),
  },
  {
    heading: "What the service does",
    body: (
      <p>
        {site.product} lets you schedule email to a list of recipients, applies per-sender delays and hourly limits, and shows the status of each message. In its current configuration messages are delivered to Ethereal test mailboxes and are not delivered to recipients&apos; real inboxes.
      </p>
    ),
  },
  {
    heading: "Your account",
    body: <p>You sign in with a Google account. You are responsible for activity under your account and for keeping access to it secure.</p>,
  },
  {
    heading: "Acceptable use",
    body: (
      <>
        <p>You agree not to use the service to:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>send unsolicited bulk email in breach of applicable law, including anti-spam and data protection law;</li>
          <li>contact people who have asked not to be contacted, or use lists you did not lawfully obtain;</li>
          <li>send malware, phishing, deceptive or unlawful content;</li>
          <li>attempt to bypass sending limits, probe the service for weaknesses or interfere with other users.</li>
        </ul>
      </>
    ),
  },
  {
    heading: "Your content",
    body: <p>You keep ownership of the lists and messages you submit. You give us permission to store and process them only to operate the service for you.</p>,
  },
  {
    heading: "Limits and availability",
    body: <p>Sending is subject to the delays and hourly limits configured on the service. Messages over a limit are rescheduled to a later hour rather than discarded. We aim for reliable operation but do not guarantee uninterrupted availability or that any message will be sent at an exact moment.</p>,
  },
  {
    heading: "Suspension and termination",
    body: <p>We may suspend or end access if these terms are breached or if use of the service creates legal or security risk. You may stop using the service at any time and ask us to delete your data.</p>,
  },
  {
    heading: "Disclaimer and liability",
    body: <p>The service is provided as is, without warranties of any kind to the extent the law allows. To the extent the law allows, our total liability for any claim relating to the service is limited to the amount you paid us in the twelve months before the claim, or zero if the service was free.</p>,
  },
  {
    heading: "Changes",
    body: <p>We may update these terms. The date at the top shows the latest version. Continued use after a change means you accept it.</p>,
  },
  {
    heading: "Governing law and contact",
    body: (
      <p>
        These terms are governed by the laws of the place where {site.company} is established. Contact us at{" "}
        <a className="underline" href={`mailto:${site.contactEmail}`}>
          {site.contactEmail}
        </a>
        .
      </p>
    ),
  },
];

export default function Terms() {
  return <LegalPage title="Terms and Conditions" sections={sections} />;
}
