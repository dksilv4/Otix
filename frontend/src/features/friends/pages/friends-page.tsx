import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { FriendsOverview } from '../components/organisms/friends-overview'
import { ActiveFriendStrip } from '../components/molecules/active-friend-strip'
import { FriendsListView } from '../components/organisms/friends-list-view'
import { FriendsActivityFeed } from '../components/organisms/friends-activity-feed'
import { FriendRequestsView } from '../components/organisms/friend-requests-view'
import { AddFriendModal } from '../components/modals/add-friend-modal'
import { ManageFriendModal } from '../components/modals/manage-friend-modal'
import { useFriends } from '../hooks/use-friends'
import { useFriendRequests } from '../hooks/use-friend-requests'
import { useFriendActivity } from '../hooks/use-friend-activity'
import type { FriendsTabKey, Friend } from '../types'

export const FriendsPage = () => {
  const [currentTab, setCurrentTab] = useState<FriendsTabKey>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isAddFriendOpen, setIsAddFriendOpen] = useState(false)
  const [managingFriend, setManagingFriend] = useState<Friend | null>(null)

  const {
    filteredFriends,
    activeFriends,
    activeNowFriends,
    totalCount,
    activeCount,
    isLoading: isFriendsLoading,
  } = useFriends({ searchQuery })

  const {
    incoming,
    outgoing,
    incomingCount,
    acceptRequest,
    rejectRequest,
    isAccepting,
    isRejecting,
    isLoading: isRequestsLoading,
  } = useFriendRequests()

  const {
    activities,
    filter: activityFilter,
    setFilter: setActivityFilter,
    isLoading: isActivityLoading,
  } = useFriendActivity()

  const handleOpenAddFriend = () => {
    setIsAddFriendOpen(true)
  }

  const handleManage = (friend: Friend) => {
    setManagingFriend(friend)
  }

  const activeFriendItems = activeFriends
    .filter((a) => a.state === 'active_now' || a.state === 'active_today')
    .map((a) => a.friend)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-20 space-y-8">
      <Helmet>
        <title>Friends — Otix</title>
      </Helmet>

      {/* Header and navigation tabs */}
      <FriendsOverview
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenAddFriend={handleOpenAddFriend}
        totalCount={totalCount}
        activeCount={activeCount}
        requestsCount={incomingCount}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Active Friends Spotlight Rail (shown on 'all' or 'active' tab when active friends exist) */}
      {(currentTab === 'all' || currentTab === 'active') && activeNowFriends.length > 0 && (
        <ActiveFriendStrip activeFriends={activeNowFriends} />
      )}

      {/* Tab Panels */}
      {currentTab === 'all' && (
        <FriendsListView
          friends={filteredFriends}
          activeFriends={activeFriends}
          searchQuery={searchQuery}
          onManage={handleManage}
          onOpenAddFriend={handleOpenAddFriend}
          isLoading={isFriendsLoading}
        />
      )}

      {currentTab === 'active' && (
        <FriendsListView
          friends={activeFriendItems}
          activeFriends={activeFriends}
          searchQuery=""
          onManage={handleManage}
          onOpenAddFriend={handleOpenAddFriend}
          isLoading={isFriendsLoading}
        />
      )}

      {currentTab === 'activity' && (
        <FriendsActivityFeed
          activities={activities}
          filter={activityFilter}
          onFilterChange={setActivityFilter}
          isLoading={isActivityLoading}
        />
      )}

      {currentTab === 'requests' && (
        <FriendRequestsView
          incoming={incoming}
          outgoing={outgoing}
          onAccept={acceptRequest}
          onReject={rejectRequest}
          isProcessing={isAccepting || isRejecting}
          isLoading={isRequestsLoading}
        />
      )}

      {/* Management & Add Modals */}
      <AddFriendModal
        open={isAddFriendOpen}
        onOpenChange={setIsAddFriendOpen}
      />

      <ManageFriendModal
        friend={managingFriend}
        open={Boolean(managingFriend)}
        onOpenChange={(open) => {
          if (!open) setManagingFriend(null)
        }}
      />
    </div>
  )
};
