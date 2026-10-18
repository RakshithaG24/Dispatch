import { LegalPage, LegalSection } from "../components/LegalPage";
import { site } from "../config/site";

const sections: LegalSection[] = [
  {
    heading: "Who we are",
    body: (
      <p>
        {site.product} is operated by {site.company}
        {site.address ? `, ${site.address}` : ""}. This policy explains what personal data the service handles and why. Questions can be sent to{" "}
        <a className="underline" href={`mailto:${site.contactEmail}`}>
          {site.contactEmail}
        </a>
        .
      </p>
    ),
  },
  {
    heading: "Data we collect",
    body: (
      <ul className="list-disc space-y-2 pl-6">
        <li>Google account details you authorise at sign-in: your name, email address, profile picture URL and Google account identifier. We do not receive your Google password.</li>
        <li>Content you submit: recipient email addresses, subjects, message bodies, start times, delays and hourly limits.</li>
        <li>Delivery records: whether each message was sent or failed, the time, the sender account used and any error returned by the mail server.</li>
        <li>Slack connection, if you choose to connect one: the incoming webhook URL, channel name and workspace name Slack returns to us.</li>
        <li>Standard server logs, which can include request times, IP addresses and error details, used to operate and secure the service.</li>
      </ul>
    ),
  },
  {
    heading: "How we use it",
    body: (
      <p>
        We use this data to sign you in, schedule and send the messages you create, show you their status, search them, and post a notice to your Slack channel when an hourly sending limit is reached. We do not sell personal data and we do not use it for advertising.
      </p>
    ),
  },
  {
    heading: "Recipients in your lists",
    body: (
      <p>
        You decide who is on the lists you upload. You are responsible for having a lawful basis to contact them, and for honouring their requests to stop. We process their addresses only to send the messages you ask us to send.
      </p>
    ),
  },
  {
    heading: "Cookies",
    body: (
      <p>
        We set one session cookie that keeps you signed in, and a short-lived cookie while you sign in with Google to protect against forged requests. Both are strictly necessary. We do not use analytics or advertising cookies.
      </p>
    ),
  },
  {
    heading: "Service providers",
    body: (
      <ul className="list-disc space-y-2 pl-6">
        <li>Google, for authentication.</li>
        <li>Slack, only if you connect it, for delivering limit notifications.</li>
        <li>Ethereal Email, the test mail service messages are currently sent through. Ethereal captures messages in a sandbox mailbox; it does not deliver them to the recipient&apos;s real inbox.</li>
        <li>Our hosting and database providers, which store the data described above on our behalf.</li>
      </ul>
    ),
  },
  {
    heading: "How long we keep data",
    body: <p>We keep your account and email records until you ask us to delete them or close your account. Disconnecting Slack deletes the stored webhook immediately.</p>,
  },
  {
    heading: "Your rights",
    body: (
      <p>
        Depending on where you live, you may have the right to access, correct, export or delete your personal data, and to object to or restrict certain processing. To exercise any of these, email{" "}
        <a className="underline" href={`mailto:${site.contactEmail}`}>
          {site.contactEmail}
        </a>
        . If you are not satisfied with our response you may contact your local data protection authority.
      </p>
    ),
  },
  {
    heading: "Security",
    body: <p>Sessions use signed, HTTP-only cookies. Connections should be served over HTTPS in production. No system is perfectly secure, and we cannot guarantee absolute security.</p>,
  },
  {
    heading: "Changes to this policy",
    body: <p>If we change this policy we will update the date at the top of this page. Material changes will also be announced inside the service.</p>,
  },
];

export default function Privacy() {
  return <LegalPage title="Privacy Policy" sections={sections} />;
}
