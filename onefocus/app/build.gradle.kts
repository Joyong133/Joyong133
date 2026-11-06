plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.joyong.onefocus"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.joyong.onefocus"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    // 고정 서명 키: 새 버전을 받아도 지우지 않고 바로 덮어 설치할 수 있게 합니다.
    signingConfigs {
        create("release") {
            storeFile = file("onefocus.keystore")
            storePassword = "onefocus"
            keyAlias = "onefocus"
            keyPassword = "onefocus"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}
