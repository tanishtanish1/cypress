Cypress.Commands.add('login', (sessionId, cacheAcrossSpecs = false) => {
  const globalSessionDetails = {
    cookies: [
      { name: '/login', value: 'value', path: '/', domain: 'localhost', secure: true, httpOnly: false, sameSite: 'no_restriction' },
      { name: 'token', value: '1', path: '/', domain: 'localhost', secure: false, httpOnly: false },
      { name: '/home', value: 'value', path: '/', domain: 'localhost', secure: true, httpOnly: false, sameSite: 'no_restriction' },
    ],
    localStorage: [
      { origin: 'https://localhost:4466', value: { animal: 'tiger', persist: 'true' } },
    ],
    sessionStorage: [
      { origin: 'https://localhost:4466', value: { food: 'zebra' } },
    ],
  }

  const specSessionDetails = {
    cookies: [
      { name: '/login', value: 'value', path: '/', domain: 'localhost', secure: true, httpOnly: false, sameSite: 'no_restriction' },
      { name: 'token', value: '2', path: '/', domain: 'localhost', secure: false, httpOnly: false },
      { name: '/home', value: 'value', path: '/', domain: 'localhost', secure: true, httpOnly: false, sameSite: 'no_restriction' },
    ],
    localStorage: [
      { origin: 'https://localhost:4466', value: { animal: 'bear' } },
    ],
    sessionStorage: [
      { origin: 'https://localhost:4466', value: { food: 'salmon' } },
    ],
  }

  cy.session(sessionId, () => {
    if (cacheAcrossSpecs) {
      cy.window().then((win) => {
        win.localStorage.setItem('persist', true)
      })
    }

    console.log(Cypress.config('port'))

    cy.visit('https://localhost:4466/login')
    cy.contains('Not Signed in...')
    cy.get('button').click()
    cy.contains('Home Page')
  }, {
    validate: () => {
      cy.visit('https://localhost:4466/home')
      cy.contains('Home Page')

      cy.then(async () => {
        const result = await Cypress.session.getCurrentSessionData()

        const expectedResult = cacheAcrossSpecs ? globalSessionDetails : specSessionDetails

        expect(result.cookies).to.have.length(3)
        result.cookies.forEach((cookie, index) => {
          expect(cookie).to.deep.include(expectedResult.cookies[index])
        })

        expect(result.localStorage).deep.members(expectedResult.localStorage)
        expect(result.sessionStorage).deep.members(expectedResult.sessionStorage)
      })
    },
    cacheAcrossSpecs,
  })
})
