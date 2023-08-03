import { type Event, Kind } from 'nostr-tools'
import { TagType, ProposalType, ProposalStatus, CoinstrKind } from '../enum'
import { type SpendingProposal, type ProofOfReserveProposal, type PublishedSpendingProposal, type PublishedProofOfReserveProposal, type SharedKeyAuthenticator, type PublishedOwnedSigner, type PublishedApprovedProposal } from '../types'
import { type Store, type NostrClient } from '../service'
import { getTagValues, fromNostrDate, buildEvent } from '../util'
import { EventKindHandler } from './EventKindHandler'
import { type BitcoinUtil } from '../models'
import { type Authenticator } from '@smontero/nostr-ual'
export class ProposalHandler extends EventKindHandler {
  private readonly store: Store
  private readonly eventsStore: Store
  private readonly approvalsStore: Store
  private readonly nostrClient: NostrClient
  private readonly bitcoinUtil: BitcoinUtil
  private readonly authenticator: Authenticator
  private readonly getSharedKeysById: (ids: string[]) => Promise<Map<string, SharedKeyAuthenticator>>
  private readonly checkPsbts: (proposalId: string) => Promise<boolean>
  private readonly getOwnedSigners: () => Promise<PublishedOwnedSigner[]>
  private readonly getApprovalsByProposalId: (proposal_ids?: string[] | string) => Promise<Map<string, PublishedApprovedProposal[]>>
  constructor(store: Store, eventsStore: Store, approvalsStore: Store, nostrClient: NostrClient, bitcoinUtil: BitcoinUtil, authenticator: Authenticator, getSharedKeysById: (ids: string[]) => Promise<Map<string, SharedKeyAuthenticator>>, checkPsbts: (proposalId: string) => Promise<boolean>,
    getOwnedSigners: () => Promise<PublishedOwnedSigner[]>,
    getApprovalsByProposalId: (proposal_ids?: string[] | string) => Promise<Map<string, PublishedApprovedProposal[]>>) {
    super()
    this.store = store
    this.eventsStore = eventsStore
    this.approvalsStore = approvalsStore
    this.nostrClient = nostrClient
    this.bitcoinUtil = bitcoinUtil
    this.authenticator = authenticator
    this.getSharedKeysById = getSharedKeysById
    this.checkPsbts = checkPsbts
    this.getOwnedSigners = getOwnedSigners
    this.getApprovalsByProposalId = getApprovalsByProposalId
  }

  private searchSignerInDescriptor(fingerprints: string[], descriptor: string): string | null {
    for (const fingerprint of fingerprints) {
      if (descriptor.includes(fingerprint)) {
        return fingerprint
      }
    }
    return null
  }

  protected async _handle<K extends number>(proposalEvents: Array<Event<K>>): Promise<Array<PublishedSpendingProposal | PublishedProofOfReserveProposal>> {
    const proposalIds = proposalEvents.map(proposal => proposal.id)
    const proposalsStatusMap = new Map<string, ProposalStatus>()
    for(const proposalId of proposalIds) {
      const status = await this.checkPsbts(proposalId) ? ProposalStatus.Signed : ProposalStatus.Unsigned
      proposalsStatusMap.set(proposalId, status)
    } 
    const decryptedProposals: any[] = []
    const rawEvents: Array<Event<K>> = []
    const policiesIds = proposalEvents.map(proposal => getTagValues(proposal, TagType.Event)[0])
    const sharedKeyAuthenticators = await this.getSharedKeysById(policiesIds)
    const signers = await this.getOwnedSigners()
    const fingerprints: string[] = signers.map(signer => signer.fingerprint)
    for (const proposalEvent of proposalEvents) {
      const storeValue: PublishedSpendingProposal | PublishedProofOfReserveProposal = this.store.get(proposalEvent.id, 'proposal_id')
      if(storeValue && proposalsStatusMap.get(proposalEvent.id) !== storeValue.status) {
        this.store.delete([storeValue])
        const updatedProposal = {...storeValue, status: proposalsStatusMap.get(proposalEvent.id)}
        decryptedProposals.push(updatedProposal)
        continue
      }
      const policyId = getTagValues(proposalEvent, TagType.Event)[0]
      const sharedKeyAuthenticator = sharedKeyAuthenticators.get(policyId)?.sharedKeyAuthenticator
      if (!sharedKeyAuthenticator) continue
      const decryptedProposalObj: SpendingProposal | ProofOfReserveProposal = await sharedKeyAuthenticator.decryptObj(proposalEvent.content)
      const type = decryptedProposalObj[ProposalType.Spending] ? ProposalType.Spending : ProposalType.ProofOfReserve
      const createdAt = fromNostrDate(proposalEvent.created_at)
      const status = await this.checkPsbts(proposalEvent.id) ? ProposalStatus.Signed : ProposalStatus.Unsigned
      const signerResult: string | null = this.searchSignerInDescriptor(fingerprints, decryptedProposalObj[type].descriptor)
      const signer = signerResult ?? 'Unknown'
      const psbt = decryptedProposalObj[type].psbt
      const fee = this.bitcoinUtil.getFee(psbt)
      const publishedProposal: PublishedSpendingProposal | PublishedProofOfReserveProposal = {
        type,
        status,
        signer,
        fee,
        ...decryptedProposalObj[type],
        createdAt,
        policy_id: policyId,
        proposal_id: proposalEvent.id
      }
      decryptedProposals.push(publishedProposal)
      rawEvents.push(proposalEvent)
    }
    this.store.store(decryptedProposals)
    this.eventsStore.store(rawEvents)
    return decryptedProposals
  }

  private async getProposalRelatedEvents(proposalIds: string[]): Promise<Map<CoinstrKind, any[]>> {
    const map: Map<CoinstrKind, any[]> = new Map()
    const approvals = Array.from((await this.getApprovalsByProposalId(proposalIds)).values()).flat()
    map.set(CoinstrKind.ApprovedProposal, approvals)
    return map
  }

  protected async _delete(proposalIds: string[]): Promise<void> {
    const promises: Promise<void>[] = []
    const eventsToDelete: Array<Event<any>> = []
    const approvalsEventsToDelete: Array<PublishedApprovedProposal> = []
    const rawEventsToDelete: Array<Event<any>> = []
    const pubKey = this.authenticator.getPublicKey()
    for (const proposalId of proposalIds) {
      const proposalEvent = this.eventsStore.get(proposalId)
      if (!proposalEvent) continue
      const proposalRelatedEvents = await this.getProposalRelatedEvents([proposalId])
      const approvalsRelatedEvents: PublishedApprovedProposal[] | undefined = (proposalRelatedEvents.get(CoinstrKind.ApprovedProposal))?.filter(approval => approval.approved_by === pubKey)
      const proposalParticipants = getTagValues(proposalEvent, TagType.PubKey)
      const policyId = getTagValues(proposalEvent, TagType.Event)[0]
      const sharedKeyAuth = await this.getSharedKeysById([policyId])
      const sharedKeyAuthenticator = sharedKeyAuth.get(policyId)?.sharedKeyAuthenticator
      if (!sharedKeyAuthenticator) continue
      const eventTag: [TagType, string][] = [[TagType.Event, proposalId]];
      const participantsTags: [TagType, string][] = proposalParticipants?.map(participant => [TagType.PubKey, participant]) ?? []
      const tags: [TagType, string][] = [...eventTag, ...participantsTags]
      const deleteEvent = await buildEvent({
        kind: Kind.EventDeletion,
        tags,
        content: ''
      }, sharedKeyAuthenticator)
      const pub = this.nostrClient.publish(deleteEvent);
      eventsToDelete.push(this.store.get(proposalId, 'proposal_id'))
      rawEventsToDelete.push(proposalEvent)
      promises.push(pub.onFirstOkOrCompleteFailure());

      if (approvalsRelatedEvents?.length) {
        const approvalsIds = approvalsRelatedEvents.map(approval => approval.approval_id)
        const approvalsRawEventsToDelete = approvalsRelatedEvents.map(approval => this.eventsStore.get(approval.approval_id))
        const approvalsTags: [TagType, string][] = approvalsIds.map(approvalId => [TagType.Event, approvalId])
        const deleteApprovalsEvent = await buildEvent({
          kind: Kind.EventDeletion,
          tags: [...approvalsTags, ...participantsTags],
          content: ''
        }, this.authenticator)
        const pubApprovals = this.nostrClient.publish(deleteApprovalsEvent);
        approvalsEventsToDelete.push(...approvalsRelatedEvents)
        rawEventsToDelete.push(...approvalsRawEventsToDelete)
        promises.push(pubApprovals.onFirstOkOrCompleteFailure());
      }
    }

    await Promise.all(promises)
    this.store.delete(eventsToDelete)
    this.approvalsStore.delete(approvalsEventsToDelete)
    this.eventsStore.delete(rawEventsToDelete)
  }

}
