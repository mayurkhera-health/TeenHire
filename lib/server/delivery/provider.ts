/* The seam.
 *
 * Everything above this line composes messages and decides who may receive
 * them; everything below it talks to somebody else's API. The interface is
 * deliberately the smallest thing that can carry an email or an SMS, because
 * the point of a seam is that the code on either side of it does not have to
 * agree about anything else.
 *
 * No provider is chosen yet. That is a product decision with a lead time —
 * a sender domain, an unsubscribe path, and for SMS in the US a 10DLC
 * registration that takes days to weeks — and it does not block any of the
 * logic that decides what to send and to whom. */

export type Method = 'email' | 'sms';

export interface OutboundMessage {
  method: Method;
  /* An email address or an E.164 phone number. Already normalised by the
     auth layer, which is the only place a contact enters the system. */
  contact: string;
  /* Ignored for SMS. Providers differ on whether a missing subject is an
     error, so it is always present and may be empty. */
  subject: string;
  text: string;
}

export type SendResult =
  | { ok: true; providerMessageId: string }
  /* retryable separates "the provider was briefly unavailable" from "this
     address does not exist". Retrying the second forever is how a queue
     turns into a backlog nobody reads. */
  | { ok: false; error: string; retryable: boolean };

export interface Provider {
  readonly name: string;
  send(message: OutboundMessage): Promise<SendResult>;
}
