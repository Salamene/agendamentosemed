from app import app, db, School, User

with app.app_context():
    db.drop_all() # Garante que todas as tabelas existentes sejam removidas
    db.create_all() # Recria as tabelas com o esquema mais recente

    # Adicionar escolas de exemplo
    schools_data = ["ARMELINDO TONON", "ÊNIO CARLOS", "FILINTO MULLER", "NILMA GLÓRIA", "PINGO DE GENTE"]
    for school_name in schools_data:
        school = School(name=school_name)
        db.session.add(school)
    db.session.commit()

    # Adicionar usuários de teste
    semed_user = User(username='semed_admin', email='semed@example.com', password='semed_password', profile_type='semed')
    db.session.add(semed_user)
    
    armelindo_school = School.query.filter_by(name='ARMELINDO TONON').first()
    if armelindo_school:
        prof_armelindo = User(username='prof_armelindo', email='prof_armelindo@example.com', password='prof_password', profile_type='professor', schools_associated=str(armelindo_school.id))
        db.session.add(prof_armelindo)
    
    enio_school = School.query.filter_by(name='ÊNIO CARLOS').first()
    if enio_school:
        tec_enio = User(username='tec_enio', email='tec_enio@example.com', password='tec_password', profile_type='tecnico', schools_associated=str(enio_school.id))
        db.session.add(tec_enio)
    
    db.session.commit()

    print("Banco de dados inicializado e populado com dados de exemplo.")

