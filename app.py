from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///agendamento.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)

# Modelos de dados
class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), nullable=False, unique=True)
    password = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True)
    profile_type = db.Column(db.String(50), default='professor') # 'professor', 'tecnico', 'semed'
    schools_associated = db.Column(db.String(500), default='') # Armazena IDs de escolas separados por vírgula
    created_at = db.Column(db.DateTime, default=datetime.now)

    sessions = db.relationship('Session', backref='user', lazy=True)

class School(db.Model):
    __tablename__ = 'schools'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, unique=True)

    students = db.relationship('Student', backref='school', lazy=True)

class Student(db.Model):
    __tablename__ = 'students'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)

class Session(db.Model):
    __tablename__ = 'sessions'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False) # Adicionado school_id para agendamento
    start_time = db.Column(db.DateTime, nullable=False)
    end_time = db.Column(db.DateTime)
    status = db.Column(db.String(50), nullable=False)

class Question(db.Model):
    __tablename__ = 'questions'
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id'), nullable=False)
    question_text = db.Column(db.String(500), nullable=False)
    answer_text = db.Column(db.String(500))
    is_correct = db.Column(db.Boolean, default=False)
    timestamp = db.Column(db.DateTime, default=datetime.now)

class StudentPerformance(db.Model):
    __tablename__ = 'student_performance'
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)
    subject = db.Column(db.String(255), nullable=False)
    score = db.Column(db.Integer, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.now)

class Teacher(db.Model):
    __tablename__ = 'teachers'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True)
    school_id = db.Column(db.Integer, db.ForeignKey('schools.id'), nullable=False)

class TeacherFeedback(db.Model):
    __tablename__ = 'teacher_feedback'
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id'), nullable=False)
    feedback_text = db.Column(db.String(500), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.now)


# Rotas da API

@app.route('/')
def index():
    return 'Backend do Sistema de Agendamento de Notebooks está funcionando!'

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    profile_type = data.get('profile_type', 'professor')
    schools_associated = data.get('schools_associated', '')

    if not username or not email or not password:
        return jsonify({'message': 'Missing data'}), 400

    if User.query.filter_by(username=username).first() or User.query.filter_by(email=email).first():
        return jsonify({'message': 'User already exists'}), 409

    new_user = User(username=username, email=email, password=password, profile_type=profile_type, schools_associated=schools_associated) # Senha não está hashed para simplicidade
    db.session.add(new_user)
    db.session.commit()
    return jsonify({'message': 'User registered successfully'}), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    user = User.query.filter_by(email=email, password=password).first() # Senha não está hashed para simplicidade

    if user:
        return jsonify({
            'message': 'Login successful',
            'user_id': user.id,
            'username': user.username,
            'email': user.email,
            'profile_type': user.profile_type,
            'schools_associated': user.schools_associated
        }), 200
    else:
        return jsonify({'message': 'Invalid credentials'}), 401

@app.route('/schools', methods=['GET'])
def get_schools():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'message': 'User ID is required'}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    if user.profile_type == 'semed':
        schools = School.query.all()
    else:
        associated_school_ids = [int(s_id) for s_id in user.schools_associated.split(',') if s_id.strip()]
        schools = School.query.filter(School.id.in_(associated_school_ids)).all()

    return jsonify([{'id': school.id, 'name': school.name} for school in schools]), 200

@app.route('/schedule', methods=['POST'])
def create_schedule():
    data = request.get_json()
    user_id = data.get('user_id')
    school_id = data.get('school_id')
    start_time_str = data.get('start_time')
    end_time_str = data.get('end_time')

    if not user_id or not school_id or not start_time_str or not end_time_str:
        return jsonify({'message': 'Missing data'}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    # Autorização: Verificar se o usuário tem permissão para agendar nesta escola
    if user.profile_type != 'semed':
        associated_school_ids = [int(s_id) for s_id in user.schools_associated.split(',') if s_id.strip()]
        if school_id not in associated_school_ids:
            return jsonify({'message': 'User not authorized to schedule for this school'}), 403

    try:
        start_time = datetime.fromisoformat(start_time_str)
        end_time = datetime.fromisoformat(end_time_str)
    except ValueError:
        return jsonify({'message': 'Invalid date format. Use ISO format (YYYY-MM-DDTHH:MM:SS).'}), 400

    new_session = Session(user_id=user_id, school_id=school_id, start_time=start_time, end_time=end_time, status='pending')
    db.session.add(new_session)
    db.session.commit()
    return jsonify({'message': 'Schedule created successfully', 'session_id': new_session.id}), 201

@app.route('/schedules', methods=['GET'])
def get_schedules():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'message': 'User ID is required'}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    if user.profile_type == 'semed':
        schedules = Session.query.all()
    else:
        associated_school_ids = [int(s_id) for s_id in user.schools_associated.split(',') if s_id.strip()]
        schedules = Session.query.filter(Session.school_id.in_(associated_school_ids)).all()

    result = []
    for schedule in schedules:
        user_obj = User('User', backref='user', lazy=True)
        school_obj = School.query.get(schedule.school_id)
        result.append({
            'id': schedule.id,
            'user': user_obj.username if user_obj else 'Unknown',
            'school': school_obj.name if school_obj else 'Unknown',
            'start_time': schedule.start_time.isoformat(),
            'end_time': schedule.end_time.isoformat(),
            'status': schedule.status
        })
    return jsonify(result), 200


@app.route('/init_db')
def init_db():
    db.drop_all()
    db.create_all()

    # Adicionar escolas de exemplo se não existirem
    schools_data = ['ARMELINDO TONON', 'ÊNIO CARLOS', 'FILINTO MULLER', 'NILMA GLÓRIA', 'PINGO DE GENTE']
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

    return jsonify({'message': 'Database initialized and populated with example data'}), 200


if __name__ == '__main__':
    with app.app_context():
        db.create_all() # Cria as tabelas se não existirem
    app.run(debug=True, port=5000)


