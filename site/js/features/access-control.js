function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase()
}

function isLocalHost() {
  const host = String(globalThis.location?.hostname || "").toLowerCase()
  return host === "127.0.0.1" || host === "localhost"
}

function createEmptyAccessRecord(email = "", isAdmin = false) {
  return {
    email,
    approved: isAdmin,
    role: isAdmin ? "admin" : "student",
    plan: isAdmin ? "owner" : "pending",
    notes: "",
    createdAt: null,
    updatedAt: null,
    approvedAt: isAdmin ? new Date().toISOString() : null,
    approvedByEmail: isAdmin ? email : null,
  }
}

export function createAccessControlFeature({ state, elements, helpers }) {
  const {
    authPanelTitle,
    authStatusText,
    authForm,
    authSessionPanel,
    authEmailInput,
    authPasswordInput,
    authUserBadge,
    cloudSyncBadge,
    accessStateBadge,
    signUpBtn,
    logInBtn,
    logOutBtn,
    pushCloudBtn,
    pullCloudBtn,
    accessGate,
    accessGateTitle,
    accessGateText,
    accessGateActions,
    protectedSidebarContent,
    protectedMainContent,
    pageShell,
    adminAccessPanel,
    adminAccessMeta,
    adminAccessSearch,
    refreshAccessListBtn,
    adminAccessList,
  } = elements

  const {
    getAccessDocRef,
    getAccessCollectionRef,
    clearProtectedUi,
    signOutUser,
  } = helpers
  let lastLockedState = null

  function focusAuthForm(mode = "signup") {
    authForm?.scrollIntoView({ behavior: "smooth", block: "start" })
    authEmailInput?.focus()
    if (mode === "login") {
      state.cloud.status = "Enter your email and password in the access panel, then log in."
    } else {
      state.cloud.status = "Enter your email and password in the access panel to request access."
    }
    renderAuthUi()
  }

  function configuredAdminEmails() {
    return (state.cloud.adminEmails || []).map(normalizeEmail).filter(Boolean)
  }

  function isConfiguredAdminEmail(email) {
    return configuredAdminEmails().includes(normalizeEmail(email))
  }

  function accessRecord() {
    return state.cloud.accessRecord || null
  }

  function isApproved() {
    return !!accessRecord()?.approved
  }

  function isAdmin() {
    const userEmail = normalizeEmail(state.cloud.user?.email)
    return !!state.cloud.user && (
      isConfiguredAdminEmail(userEmail)
      || (isApproved() && accessRecord()?.role === "admin")
    )
  }

  function hasDevBypass() {
    return !state.cloud.configured
      && state.cloud.accessControl?.allowDevBypassOnLocalhost
      && isLocalHost()
  }

  function isCheckingSession() {
    return state.cloud.available
      && state.cloud.configured
      && state.cloud.accessControl?.enabled !== false
      && !state.cloud.authResolved
  }

  function isLockedOut() {
    if (hasDevBypass()) return false
    if (!state.cloud.available || !state.cloud.accessControl?.enabled) return false
    if (isCheckingSession()) return true
    if (!state.cloud.user) return true
    if (!state.cloud.accessControl?.requireApproval) return false
    return !isApproved()
  }

  function setProtectedVisibility(allowed) {
    if (protectedSidebarContent) protectedSidebarContent.hidden = !allowed
    if (protectedMainContent) protectedMainContent.hidden = !allowed
    if (accessGate) accessGate.hidden = allowed
  }

  async function ensureAccessRecord() {
    if (!state.cloud.user || !state.cloud.db) return null
    const { getDoc, setDoc, serverTimestamp } = state.cloud.firebaseFns
    const ref = getAccessDocRef(state.cloud.user.uid)
    const snapshot = await getDoc(ref)
    const userEmail = normalizeEmail(state.cloud.user.email)

    if (!snapshot.exists()) {
      const adminBootstrap = isConfiguredAdminEmail(userEmail)
      const nextRecord = createEmptyAccessRecord(userEmail, adminBootstrap)
      await setDoc(ref, {
        ...nextRecord,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true })
      return { ...nextRecord, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    }

    const existing = snapshot.data() || {}
    if (isConfiguredAdminEmail(userEmail) && (!existing.approved || existing.role !== "admin")) {
      await setDoc(ref, {
        email: userEmail,
        approved: true,
        role: "admin",
        plan: existing.plan || "owner",
        approvedAt: existing.approvedAt || serverTimestamp(),
        approvedByEmail: existing.approvedByEmail || userEmail,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      return {
        ...existing,
        email: userEmail,
        approved: true,
        role: "admin",
        plan: existing.plan || "owner",
        approvedAt: existing.approvedAt || new Date().toISOString(),
        approvedByEmail: existing.approvedByEmail || userEmail,
      }
    }

    return existing
  }

  async function refreshAccessRecord() {
    if (!state.cloud.user || !state.cloud.db) {
      state.cloud.accessRecord = null
      return null
    }

    state.cloud.accessRecord = await ensureAccessRecord()
    return state.cloud.accessRecord
  }

  async function refreshAdminRoster() {
    if (!isAdmin() || !state.cloud.db) {
      state.cloud.adminRoster = []
      renderAdminList()
      return
    }

    const { getDocs } = state.cloud.firebaseFns
    const snapshot = await getDocs(getAccessCollectionRef())
    state.cloud.adminRoster = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((left, right) => normalizeEmail(left.email).localeCompare(normalizeEmail(right.email)))
    renderAdminList()
  }

  async function updateAccessRecord(userId, patch) {
    if (!isAdmin() || !state.cloud.db) return
    const { setDoc, serverTimestamp } = state.cloud.firebaseFns
    await setDoc(getAccessDocRef(userId), {
      ...patch,
      updatedAt: serverTimestamp(),
      approvedByEmail: normalizeEmail(state.cloud.user?.email),
    }, { merge: true })
    await refreshAdminRoster()
    if (state.cloud.user?.uid === userId) await refreshAccessRecord()
    renderAll()
  }

  function accessStateLabel() {
    if (hasDevBypass()) return "Dev bypass"
    if (!state.cloud.available || !state.cloud.accessControl?.enabled) return "Open"
    if (!state.cloud.user) return "Locked"
    if (isApproved()) return isAdmin() ? "Admin" : "Approved"
    if ((accessRecord()?.plan || "") === "revoked") return "Revoked"
    return "Pending"
  }

  function statusCopy() {
    if (hasDevBypass()) {
      return {
        title: "Local preview bypass is active",
        body: "Firebase access control is not configured on localhost, so EconFlow stays open for development only.",
      }
    }
    if (!state.cloud.available || !state.cloud.accessControl?.enabled) {
      return {
        title: "Access control is disabled",
        body: "Enable Firebase access control to require approval before students can open paid revision content.",
      }
    }
    if (!state.cloud.configured) {
      return {
        title: "Configure Firebase before selling access",
        body: "Fill in site/firebase-config.js and set your admin email so sign-in approval can lock the site properly.",
      }
    }
    if (isCheckingSession()) {
      return {
        title: "Checking your saved session",
        body: "Hold on while EconFlow restores access on this device.",
      }
    }
    if (!state.cloud.user) {
      return {
        title: "Sign in to unlock EconFlow",
        body: "Only approved student accounts can open the dashboard, study workspace, quizzes, and revision tools.",
      }
    }
    if ((accessRecord()?.plan || "") === "revoked") {
      return {
        title: "Your access is not active",
        body: "This account is signed in, but access has been revoked. Contact the EconFlow admin if you need help.",
      }
    }
    if (!isApproved()) {
      return {
        title: "Waiting for approval",
        body: "Your account exists, but an admin still needs to approve paid access before the site unlocks.",
      }
    }
    return {
      title: isAdmin() ? "Admin access is active" : "Access approved",
      body: isAdmin()
        ? "You can open the site and approve or revoke other users from the admin access panel."
        : "Your account is approved. The EconFlow dashboard and study tools are unlocked on this device.",
    }
  }

  function makeActionButton(label, onClick, tone = "primary") {
    const button = document.createElement("button")
    button.type = "button"
    button.className = tone === "ghost" ? "button button-ghost" : "button"
    button.textContent = label
    button.addEventListener("click", onClick)
    return button
  }

  function renderAccessGateUi() {
    if (!accessGate || !accessGateTitle || !accessGateText || !accessGateActions) return
    const copy = statusCopy()
    accessGateTitle.textContent = copy.title
    accessGateText.textContent = copy.body
    accessGateActions.innerHTML = ""

    if (isCheckingSession()) {
      return
    }
    if (!state.cloud.user) {
      accessGateActions.append(
        makeActionButton("Create account", () => focusAuthForm("signup")),
        makeActionButton("Log in", () => focusAuthForm("login"), "ghost"),
      )
    } else if (!isApproved() && !hasDevBypass()) {
      accessGateActions.append(
        makeActionButton("Refresh access", () => refreshAfterAuth()),
        makeActionButton("Log out", () => signOutUser(), "ghost"),
      )
    } else if (isAdmin()) {
      accessGateActions.append(
        makeActionButton("Open admin panel", () => adminAccessPanel?.scrollIntoView({ behavior: "smooth", block: "start" })),
      )
    }
  }

  function renderAdminList() {
    if (!adminAccessList) return
    adminAccessList.innerHTML = ""
    if (!isAdmin()) return

    const query = normalizeEmail(adminAccessSearch?.value || "")
    const items = (state.cloud.adminRoster || []).filter((item) => {
      if (!query) return true
      const haystack = [item.email, item.plan, item.role, item.approved ? "approved" : "pending"].map(normalizeEmail).join(" ")
      return haystack.includes(query)
    })

    if (!items.length) {
      const empty = document.createElement("div")
      empty.className = "empty-state"
      empty.textContent = "No access records match this search yet."
      adminAccessList.append(empty)
      return
    }

    for (const item of items) {
      const card = document.createElement("article")
      card.className = "revision-card access-user-card"

      const head = document.createElement("div")
      head.className = "access-user-head"
      head.innerHTML = `
        <strong>${item.email || item.id}</strong>
        <span>${item.approved ? "Approved" : item.plan === "revoked" ? "Revoked" : "Pending"} | ${item.role || "student"} | ${item.plan || "pending"}</span>
      `

      const chips = document.createElement("div")
      chips.className = "study-sidebar-meta"
      chips.append(
        Object.assign(document.createElement("span"), { className: "metric", textContent: item.approved ? "Approved" : "Pending" }),
        Object.assign(document.createElement("span"), { className: "metric", textContent: item.role || "student" }),
      )

      const actions = document.createElement("div")
      actions.className = "topic-actions"
      if (!item.approved || item.plan === "revoked") {
        actions.append(makeActionButton("Approve", () => updateAccessRecord(item.id, {
          approved: true,
          role: item.role || "student",
          plan: item.plan === "owner" ? "owner" : "paid",
          approvedAt: state.cloud.firebaseFns.serverTimestamp(),
        })))
      }
      if (item.approved) {
        actions.append(makeActionButton("Revoke", () => updateAccessRecord(item.id, {
          approved: false,
          role: isConfiguredAdminEmail(item.email) ? "admin" : "student",
          plan: "revoked",
        }), "ghost"))
      }
      if (item.role !== "admin") {
        actions.append(makeActionButton("Make admin", () => updateAccessRecord(item.id, {
          approved: true,
          role: "admin",
          plan: item.plan === "owner" ? "owner" : "paid",
          approvedAt: state.cloud.firebaseFns.serverTimestamp(),
        }), "ghost"))
      } else if (!isConfiguredAdminEmail(item.email)) {
        actions.append(makeActionButton("Remove admin", () => updateAccessRecord(item.id, {
          role: "student",
        }), "ghost"))
      }

      card.append(head, chips, actions)
      adminAccessList.append(card)
    }
  }

  function renderAuthUi() {
    const copy = statusCopy()
    authPanelTitle.textContent = copy.title
    authStatusText.textContent = state.cloud.status || copy.body
    authUserBadge.textContent = state.cloud.user?.email || "Signed out"
    cloudSyncBadge.textContent = state.cloud.syncLabel || "Not synced"
    if (accessStateBadge) accessStateBadge.textContent = accessStateLabel()

    const signedIn = !!state.cloud.user
    authForm.hidden = signedIn || !state.cloud.configured || isCheckingSession()
    authSessionPanel.hidden = !signedIn
    if (signedIn) {
      if (authEmailInput) authEmailInput.value = ""
      if (authPasswordInput) authPasswordInput.value = ""
    }

    const syncEnabled = signedIn && (isApproved() || hasDevBypass())
    pushCloudBtn.disabled = !syncEnabled
    pullCloudBtn.disabled = !syncEnabled
    logOutBtn.disabled = !signedIn
    signUpBtn.disabled = !state.cloud.configured || !state.cloud.accessControl?.allowSelfSignup
    logInBtn.disabled = !state.cloud.configured

    if (adminAccessPanel) adminAccessPanel.hidden = !isAdmin()
    if (adminAccessMeta && isAdmin()) {
      const pendingCount = (state.cloud.adminRoster || []).filter((item) => !item.approved && item.plan !== "revoked").length
      adminAccessMeta.textContent = pendingCount
        ? `${pendingCount} account${pendingCount === 1 ? "" : "s"} waiting for approval.`
        : "All visible accounts are approved or revoked."
    }
  }

  async function refreshAfterAuth() {
    if (!state.cloud.user) {
      renderAll()
      return
    }

    state.cloud.status = `Signed in as ${state.cloud.user.email}. Checking access...`
    renderAll()
    await refreshAccessRecord()

    if (isApproved() || hasDevBypass()) {
      state.cloud.status = isAdmin()
        ? "Admin access approved. Dashboard and access controls are unlocked."
        : "Access approved. Dashboard and study tools are unlocked."
      state.cloud.syncLabel = state.cloud.user ? "Checking cloud save" : state.cloud.syncLabel
      await helpers.pullProgressIfAllowed()
    } else if ((accessRecord()?.plan || "") === "revoked") {
      state.cloud.status = "This account is signed in, but access has been revoked."
      state.cloud.syncLabel = "Access revoked"
    } else {
      state.cloud.status = "Account created. An admin needs to approve access before the site unlocks."
      state.cloud.syncLabel = "Awaiting approval"
    }

    if (isAdmin()) await refreshAdminRoster()
    renderAll()
  }

  function clearAccessState() {
    state.cloud.accessRecord = null
    state.cloud.adminRoster = []
    renderAll()
  }

  function renderAll() {
    const allowed = !isLockedOut()
    if (!allowed) clearProtectedUi?.()
    setProtectedVisibility(allowed)
    pageShell?.classList.toggle("is-access-state", !allowed)
    if (!allowed && lastLockedState !== true && state.cloud.authResolved) {
      accessGate?.scrollIntoView({ behavior: "auto", block: "start" })
    }
    lastLockedState = !allowed
    renderAccessGateUi()
    renderAuthUi()
    renderAdminList()
  }

  function bindEvents() {
    adminAccessSearch?.addEventListener("input", renderAdminList)
    refreshAccessListBtn?.addEventListener("click", () => {
      refreshAdminRoster().catch((error) => {
        state.cloud.status = `Admin refresh failed: ${error.message || error}`
        renderAll()
      })
    })
  }

  bindEvents()

  return {
    clearAccessState,
    hasDevBypass,
    isAdmin,
    isApproved,
    isCheckingSession,
    isLockedOut,
    refreshAdminRoster,
    refreshAfterAuth,
    renderAll,
  }
}
