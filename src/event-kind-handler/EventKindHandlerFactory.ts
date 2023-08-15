import { EventKindHandler } from "./EventKindHandler";
import { PolicyHandler } from "./PolicyHandler";
import { Coinstr } from "../Coinstr";
import { CoinstrKind, StoreKind } from "../enum";
import { SharedKeyHandler } from "./SharedKeyHandler";
import { ProposalHandler } from "./ProposalHandler";
import { ApprovalsHandler } from "./ApprovalsHandler";
import { CompletedProposalHandler } from "./CompletedProposalHandler";
import { SharedSignerHandler } from "./SharedSignersHandler"
import { OwnedSignerHandler } from "./OwnedSignersHandler";
import { MetadataHandler } from "./MetadataHandler";
import { ContactsHandler } from "./ContactsHandler";
import { EventDeletionHandler } from "./EventDeletionHandler";
import { LabelsHandler } from "./LabelsHandler";
import { Kind } from "nostr-tools";
export class EventKindHandlerFactory {
  private coinstr: Coinstr
  private handlers: Map<number, EventKindHandler>
  constructor(coinstr: Coinstr) {
    this.coinstr = coinstr
    this.handlers = new Map()
  }

  getHandler(eventKind: number): EventKindHandler {
    if (!this.handlers.has(eventKind)) {
      const {
        authenticator,
        bitcoinUtil,
        nostrClient,
        stores
      } = this.coinstr
      const getSharedKeysById = this.coinstr.getSharedKeysById
      const checkPsbts = this.coinstr.checkPsbts
      const getOwnedSigners = this.coinstr.getOwnedSigners
      const getCompletedProposalsByPolicyId = this.coinstr.getCompletedProposalsByPolicyId
      const getProposalsByPolicyId = this.coinstr.getProposalsByPolicyId
      const getApprovalsByPolicyId = this.coinstr.getApprovalsByPolicyId
      const getApprovalsByProposalId = this.coinstr.getApprovals
      const eventsStore = stores.get(StoreKind.Events)!
      const completedProposalsStore = stores.get(CoinstrKind.CompletedProposal)!
      const proposalsStore = stores.get(CoinstrKind.Proposal)!
      const approvalsStore = stores.get(CoinstrKind.ApprovedProposal)!
      const sharedKeysStore = stores.get(CoinstrKind.SharedKey)!
      switch (eventKind) {
        case CoinstrKind.Policy:
          this.handlers.set(eventKind, new PolicyHandler(stores.get(eventKind)!, eventsStore, completedProposalsStore, proposalsStore, approvalsStore, sharedKeysStore, nostrClient, bitcoinUtil, authenticator,
            getSharedKeysById, getCompletedProposalsByPolicyId, getProposalsByPolicyId, getApprovalsByPolicyId))
          break
        case CoinstrKind.Proposal:
          this.handlers.set(eventKind, new ProposalHandler(stores.get(eventKind)!, eventsStore, approvalsStore, nostrClient, bitcoinUtil, authenticator, getSharedKeysById, checkPsbts, getOwnedSigners, getApprovalsByProposalId))
          break
        case CoinstrKind.ApprovedProposal:
          this.handlers.set(eventKind, new ApprovalsHandler(stores.get(eventKind)!, eventsStore, nostrClient, authenticator, getSharedKeysById))
          break
        case CoinstrKind.SharedKey:
          this.handlers.set(eventKind, new SharedKeyHandler(authenticator, stores.get(eventKind)!, eventsStore))
          break
        case CoinstrKind.CompletedProposal:
          this.handlers.set(eventKind, new CompletedProposalHandler(stores.get(eventKind)!, eventsStore, nostrClient, bitcoinUtil, getSharedKeysById))
          break
        case CoinstrKind.SharedSigners:
          this.handlers.set(eventKind, new SharedSignerHandler(authenticator, stores.get(eventKind)!, eventsStore))
          break
        case CoinstrKind.Signers:
          this.handlers.set(eventKind, new OwnedSignerHandler(authenticator, nostrClient, stores.get(eventKind)!, eventsStore))
          break
        case Kind.Metadata:
          this.handlers.set(eventKind, new MetadataHandler(stores.get(eventKind)!))
          break
        case Kind.Contacts:
          this.handlers.set(eventKind, new ContactsHandler())
          break
        case Kind.EventDeletion:
          this.handlers.set(eventKind, new EventDeletionHandler(stores))
          break
        case CoinstrKind.Labels:
          this.handlers.set(eventKind, new LabelsHandler(stores.get(eventKind)!, eventsStore, getSharedKeysById))
          break
        default:
          throw new Error(`There is no handler for event kind: ${eventKind}`)

      }
    }
    return this.handlers.get(eventKind)!
  }
}