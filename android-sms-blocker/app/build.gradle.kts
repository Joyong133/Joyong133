plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// CI build number → ever-increasing versionCode, so each new APK installs as an update.
val ciRun: Int? = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull()
// Release signing key, provided by CI (see .github/workflows/android.yml).
val signingStore: String? = System.getenv("SIGNING_STORE_FILE")

android {
    namespace = "com.joyong.smsblocker"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.joyong.smsblocker"
        minSdk = 26
        targetSdk = 34
        versionCode = 100 + (ciRun ?: 0)
        versionName = "1.4" + (ciRun?.let { ".$it" } ?: "")
    }

    signingConfigs {
        if (signingStore != null) {
            create("release") {
                storeFile = file(requireNotNull(signingStore))
                storePassword = System.getenv("SIGNING_STORE_PASSWORD")
                keyAlias = System.getenv("SIGNING_KEY_ALIAS")
                keyPassword = System.getenv("SIGNING_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (signingStore != null) signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        viewBinding = true
    }
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
}
