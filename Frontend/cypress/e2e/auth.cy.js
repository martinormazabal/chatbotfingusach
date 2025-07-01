describe('Authentication Tests', () => {
  it('Student: Should log in and see only student-related buttons', () => {
    cy.visit('/login');
    cy.get('input[type="email"]').type('estudiante1@usach.cl');
    cy.get('input[type="password"]').type('estoHash');
    cy.get('button[type="submit"]').click();
    cy.waitUntil(() =>
      cy.window().then((win) => {
        return win.localStorage.getItem('user') !== null;
      })
    );

    cy.contains('button', 'Ver Documentos Subidos').should('exist');
    cy.contains('button', 'Consultar Reglamentos').should('exist');
    cy.contains('button', 'Subir Documentos').should('not.exist');
    cy.contains('button', 'Crear Usuario').should('not.exist');
    cy.contains('button', 'Asignar Rol').should('not.exist');
  });

  it('Funcionarios: Should log in and see only funcionarios-related buttons', () => {
    cy.visit('/login');
    cy.get('input[type="email"]').type('funcionarios1@usach.cl');
    cy.get('input[type="password"]').type('estoHash');
    cy.get('button[type="submit"]').click();
    cy.waitUntil(() =>
      cy.window().then((win) => {
        return win.localStorage.getItem('user') !== null;
      })
    );

    cy.contains('button', 'Crear Usuario').should('exist');
    cy.contains('button', 'Asignar Rol').should('exist');
    cy.contains('button', 'Consultar Reglamentos').should('exist');
    cy.contains('button', 'Ver Documentos Subidos').should('not.exist');
    cy.contains('button', 'Subir Documentos').should('not.exist');
  });

  it('Documentos: Should log in and see only documentos-related buttons', () => {
    cy.visit('/login');
    cy.get('input[type="email"]').type('documentos1@usach.cl');
    cy.get('input[type="password"]').type('estoHash');
    cy.get('button[type="submit"]').click();
    cy.waitUntil(() =>
      cy.window().then((win) => {
        return win.localStorage.getItem('user') !== null;
      })
    );

    cy.contains('button', 'Subir Documentos').should('exist');
    cy.contains('button', 'Ver Documentos Subidos').should('exist');
    cy.contains('button', 'Consultar Reglamentos').should('exist');
    cy.contains('button', 'Crear Usuario').should('not.exist');
    cy.contains('button', 'Asignar Rol').should('not.exist');
  });

  it('Should display error message when API limit is reached', () => {
    cy.visit('/chatbot'); // Assuming your chatbot page is at /chatbot
  
    // Send 16 requests to the chatbot API
    for (let i = 0; i < 16; i++) {
      cy.get('input[aria-label="Ask me anything..."]').type('Test query ' + i);
      cy.get('button[type="submit"]').click();
      cy.wait(1000); // Wait for the request to complete
    }
  
    // Check if the error message is displayed
    cy.contains('Espera un momento antes de otra consulta.').should('be.visible');
  });
});