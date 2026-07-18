// Custom commands for the CSEDU E2E suite.

// Login via the UI (local auth fallback path, SDD §6.1).
Cypress.Commands.add("login", (email: string, password: string) => {
  cy.visit("/login");
  cy.get("#email").type(email);
  cy.get("#password").type(password, { log: false });
  cy.get('button[type="submit"]').click();
  cy.url().should("include", "/dashboard");
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<void>;
    }
  }
}

export {};
