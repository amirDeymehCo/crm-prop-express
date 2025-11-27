pipeline {
    agent any

    environment {
        COMPOSE_FILE = 'docker-compose.yml'
        REPO_NAME = 'https://github.com/myprop-trade/express-backend.git'
    }

    stages {
        stage('Checkout Code') {
            steps {
                echo "📥 Cloning repository from Git..."
                checkout scm
            }
        }

        stage('Build Docker Images') {
            steps {
                echo "🔨 Building Docker images..."
                sh "docker-compose -f ${COMPOSE_FILE} down"
                sh "docker-compose -f ${COMPOSE_FILE} build --no-cache"
            }
        }

        stage('Start Docker Containers #2') {
            steps {
                echo "🚀 Starting Docker containers..."
                sh "docker-compose -f ${COMPOSE_FILE} up -d"
            }
        }
    }

    post {
        always {
            script {
                def buildStatus = currentBuild.currentResult
                def buildTime = currentBuild.durationString
                def buildNumber = currentBuild.number
                def buildBranch = env.GIT_BRANCH
                def commitHash = sh(script: 'git log -1 --pretty=%h', returnStdout: true).trim()
                def commiter = sh(script: 'git log -1 --pretty=%an', returnStdout: true).trim()
                def commitText = sh(script: 'git log -1 --pretty=%s', returnStdout: true).trim()
                def message = ""

                switch(buildStatus) {
                    case 'SUCCESS':
                        message = """
✅ Build Successful! 🎉
Project: *${REPO_NAME}*
Build : #${buildNumber}
Branch: *${buildBranch}*
Commit: *${commitHash}*
Commit Text: *${commitText}*
Commiter: *${commiter}*
Time Taken: ${buildTime}
🚀 The build was successful and the containers are up and running!
                        """
                        break
                    case 'FAILURE':
                        message = """
❌ Build Failed! 😢
Project: *${REPO_NAME}*
Build : #${buildNumber}
Branch: *${buildBranch}*
Commit: *${commitHash}*
Commit Text: *${commitText}*
Commiter: *${commiter}*
Time Taken: ${buildTime}
🔴 Something went wrong. Please check the logs and fix the issue.
                        """
                        break
                    case 'UNSTABLE':
                        message = """
⚠️ Build Unstable! 🚨
Project: *${REPO_NAME}*
Build : #${buildNumber}
Branch: *${buildBranch}*
Commit: *${commitHash}*
Commit Text: *${commitText}*
Commiter: *${commiter}*
Time Taken: ${buildTime}
⚙️ The build completed with warnings or minor issues.
                        """
                        break
                    default:
                        message = """
❗ Unknown Build Status!
Project: *${REPO_NAME}*
Build : #${buildNumber}
Branch: *${buildBranch}*
Commit: *${commitHash}*
Commit Text: *${commitText}*
Commiter: *${commiter}*
Time Taken: ${buildTime}
                        """
                        break
                }

                echo message
                sh "curl -s -X POST https://api.telegram.org/bot7677321652:AAFiODEp6hEfBrXjtxRJ5By_ByAWIIj9Lq0/sendMessage -d chat_id=-1002581518005 -d text='${message}' -d parse_mode=Markdown"
            }
        }
    }
}
